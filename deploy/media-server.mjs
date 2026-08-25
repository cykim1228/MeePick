/**
 * MeePick 미디어 업로드 서버 — 모임 사진을 NAS의 Photo/Server 폴더에 쌓는다.
 *
 * 의존성이 하나도 없다(node 기본 모듈만 쓴다). NAS에서 npm install을 돌릴 일이 없도록
 * 한 것이다 — DSM에는 빌드 도구가 없고, 이미지를 다시 굽는 것도 부담이라
 * `node:22-alpine`에 이 파일 한 장만 얹어 띄운다.
 *
 * **읽기는 이 서버가 하지 않는다.** nginx가 같은 폴더를 직접 서빙한다(캐시·Range 처리가
 * 훨씬 낫다). 여기는 쓰기 전용이고, 쓰기는 반드시 Supabase 토큰 검증을 통과해야 한다 —
 * MeePick은 지금 LAN 전용이지만, 검증 없는 업로드 창구는 집 안 어느 기기가 잘못 돌아가도
 * NAS를 채울 수 있고, 나중에 밖으로 열 때 이 결정을 다시 떠올릴 사람도 없다.
 *
 * 저장 경로는 `YYYY/MM/<uuid>.<확장자>`. 연·월 폴더로 나눠야 Synology Photos에서
 * 시간순으로 훑기 좋고, 한 폴더에 수천 장이 쌓이는 것도 막는다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chown, mkdir, stat, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
// EXPO_PUBLIC_ 이름도 받는다 — NAS에서 리포지토리를 직접 빌드하는 구성(방식 B)은
// 앱의 .env를 그대로 넘겨 쓰는데, 거기엔 접두사가 붙은 이름만 있다.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(
  /\/$/,
  ''
);
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** 한 장의 상한. 앱이 1600px webp로 줄여 보내므로 보통 200KB 안쪽이고, 움짤만 크다. */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * 확장자는 Content-Type에서만 정한다. 클라이언트가 준 파일명을 쓰면
 * `../../etc/passwd` 같은 경로가 섞여 들어올 수 있다.
 */
const EXT_BY_TYPE = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/apng': 'apng',
};

// ── 파일 주인 맞추기 ────────────────────────────────────────────────────────
/**
 * 컨테이너는 root로 도는데, 바인드 마운트에 쓴 파일은 그 소유권을 NAS 파일시스템에
 * 그대로 남긴다. 그러면 사진이 root 소유로 쌓여 Synology Photos가 색인하지 못하거나
 * File Station에서 지우지 못하는 일이 생긴다.
 *
 * uid를 추측하지 않는다 — /data 폴더 자신의 주인을 읽어 그대로 따라간다.
 * 그 폴더를 만든 사람이 곧 이 사진들의 주인이어야 할 사람이다.
 */
let owner = null;

async function adopt(path) {
  if (!owner) return;
  try {
    await chown(path, owner.uid, owner.gid);
  } catch {
    // 권한이 없거나 윈도우 같은 환경이면 그냥 둔다. 저장 자체를 실패시킬 일은 아니다.
  }
}

// ── 인증 ────────────────────────────────────────────────────────────────────

/**
 * 토큰 검증 결과 캐시. 사진 5장짜리 글을 올리면 업로드도 5번이라,
 * 캐시가 없으면 Supabase에 매번 왕복한다. 짧게 잡아 권한 회수도 곧 반영되게 한다.
 */
const authCache = new Map();
const AUTH_TTL_MS = 60_000;

/**
 * "회원인가"까지 확인한다. 가입은 인터넷에 열려 있어서 계정이 있다는 것만으로는
 * 부족하다 — profiles 행이 있어야 비로소 모임 사람이다. profiles의 RLS가
 * `is_member()`라, 회원이 아닌 토큰으로 읽으면 빈 배열이 온다.
 */
async function isMember(token) {
  const key = createHash('sha256').update(token).digest('hex');
  const hit = authCache.get(key);
  if (hit && hit.until > Date.now()) return hit.ok;

  let ok = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    // 토큰이 썩었으면 401, 회원이 아니면 200이지만 빈 배열이다 — 둘 다 거절.
    const rows = res.ok ? await res.json() : [];
    ok = Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.error('[media] 인증 확인 실패:', e.message);
    ok = false;
  }

  authCache.set(key, { ok, until: Date.now() + AUTH_TTL_MS });
  return ok;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function cors(res, req) {
  // 개발 서버(localhost:8081)에서도 같은 NAS에 올릴 수 있어야 한다.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

/** 요청 본문을 파일로 흘려보낸다. 상한을 넘으면 도중에 끊고 만들던 파일을 지운다. */
function receive(req, filePath) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(filePath);
    let size = 0;
    let failed = false;

    const fail = (err) => {
      if (failed) return;
      failed = true;
      out.destroy();
      unlink(filePath).catch(() => {});
      reject(err);
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        req.destroy();
        fail(new Error('too-large'));
      }
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => {
      if (!failed) resolve(size);
    });
    req.pipe(out);
  });
}

const server = createServer(async (req, res) => {
  cors(res, req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, dir: DATA_DIR });
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/upload')) {
    json(res, 404, { error: 'not found' });
    return;
  }

  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !(await isMember(token))) {
    json(res, 401, { error: '로그인이 필요합니다.' });
    return;
  }

  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type];
  if (!ext) {
    json(res, 415, { error: `지원하지 않는 형식입니다 (${type || '알 수 없음'})` });
    return;
  }

  const now = new Date();
  const rel = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
  const abs = join(DATA_DIR, rel);

  try {
    await mkdir(dirname(abs), { recursive: true });
    // 연·월 폴더도 함께 맞춘다. 이미 맞으면 아무 일도 일어나지 않는다.
    await adopt(dirname(dirname(abs)));
    await adopt(dirname(abs));
    const size = await receive(req, abs);
    await adopt(abs);
    console.log(`[media] 저장 ${rel} (${Math.round(size / 1024)}KB)`);
    json(res, 201, { path: rel, size });
  } catch (e) {
    if (e.message === 'too-large') {
      json(res, 413, { error: `사진은 ${MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.` });
    } else {
      console.error('[media] 저장 실패:', e.message);
      json(res, 500, { error: '저장에 실패했습니다.' });
    }
  }
});

// ── 기동 점검 ───────────────────────────────────────────────────────────────
// 볼륨 경로를 잘못 잡으면 컨테이너는 멀쩡히 뜨고 사진만 엉뚱한 곳에 쌓인다.
// 그 조용한 실패가 제일 나쁘므로, 뜨는 순간 어디에 쓰는지 눈에 보이게 찍는다.
async function checkMount() {
  try {
    const dir = await stat(DATA_DIR);
    owner = { uid: dir.uid, gid: dir.gid };
    await stat(join(DATA_DIR, '.meepick-media'));
    console.log(
      `[media] ✅ ${DATA_DIR} — Photo/Server 폴더를 찾았습니다. (사진 주인 ${dir.uid}:${dir.gid})`
    );
  } catch {
    console.warn(
      `[media] ⚠️  ${DATA_DIR} 에 .meepick-media 표식이 없습니다.\n` +
        `        MEDIA_DIR이 NAS의 Photo/Server 실제 경로를 가리키는지 확인하세요.\n` +
        `        확인: ls -d /volume*/photo/Server`
    );
  }
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[media] SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다. 업로드가 전부 거부됩니다.');
}

void checkMount();
server.listen(PORT, () => console.log(`[media] listening on ${PORT}, 저장 위치 ${DATA_DIR}`));
