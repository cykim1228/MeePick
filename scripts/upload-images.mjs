/**
 * 노션에서 받은 표지 이미지를 리사이즈해 Supabase Storage에 올리고,
 * games.image_path 에 객체 키를 기록한다.
 *
 *   node scripts/upload-images.mjs           # image_path가 비어 있는 것만
 *   node scripts/upload-images.mjs --force   # 전부 다시 올림
 *
 * .env 의 SUPABASE_SECRET_KEY 가 필요하다. 이 키는 RLS를 우회하므로 앱에 넣지 않는다
 * (EXPO_PUBLIC_ 접두사가 없어 Expo 번들에 포함되지 않는다).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTION_DIR = join(ROOT, '_workspace', '00_input', 'notion');
const BUCKET = 'game-images';

/** 카드 썸네일 기준. 원본은 최대 2.9MB라 그대로 올리면 목록 첫 화면이 느리고 트래픽도 낭비된다. */
const MAX_WIDTH = 600;
const WEBP_QUALITY = 80;
const CONCURRENCY = 4;

/* ── 설정 읽기 ───────────────────────────────────────────────────────────── */
function readEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) throw new Error('.env 가 없습니다. SUPABASE_SETUP.md 참고');
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = readEnv();
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;

if (!URL_BASE) throw new Error('.env 에 EXPO_PUBLIC_SUPABASE_URL 이 없습니다.');
if (!SECRET) {
  throw new Error(
    '.env 에 SUPABASE_SECRET_KEY 가 없습니다.\n' +
      'Supabase 대시보드 → Project Settings → API → service_role (또는 sb_secret_...) 키를 넣으세요.\n' +
      '이 키는 EXPO_PUBLIC_ 접두사 없이 두어야 앱 번들에 들어가지 않습니다.'
  );
}

const authHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}` };

/* ── sharp는 선택 ────────────────────────────────────────────────────────── */
let sharp = null;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.warn('! sharp를 불러오지 못했습니다. 원본을 그대로 올립니다 (용량이 큽니다).');
}

/* ── 실행 ────────────────────────────────────────────────────────────────── */
const force = process.argv.includes('--force');

const res = await fetch(
  `${URL_BASE}/rest/v1/games?select=id,title_ko,image_file,image_path&image_file=not.is.null&limit=1000`,
  { headers: authHeaders }
);
if (!res.ok) throw new Error(`게임 목록 조회 실패 (${res.status}): ${await res.text()}`);
const games = await res.json();

const onDisk = existsSync(NOTION_DIR) ? new Set(readdirSync(NOTION_DIR)) : new Set();

const targets = games.filter((g) => force || !g.image_path);
console.log(
  `이미지 있는 게임 ${games.length}종 중 ${targets.length}종 업로드 대상` +
    (force ? ' (--force)' : ' (이미 올린 것은 건너뜀)')
);

const missing = [];
const failed = [];
let done = 0;

async function processOne(game) {
  const src = game.image_file;
  if (!onDisk.has(src)) {
    missing.push(`${game.title_ko} → ${src}`);
    return;
  }

  const buf = readFileSync(join(NOTION_DIR, src));
  let body = buf;
  let ext = extname(src).toLowerCase().replace('.', '') || 'png';
  let contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

  if (sharp) {
    // 원본보다 작을 때만 축소한다. 확대하면 화질만 나빠지고 용량은 늘어난다.
    body = await sharp(buf)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    ext = 'webp';
    contentType = 'image/webp';
  }

  // 게임 id를 키로 쓴다. 노션 파일명은 공백·한글이 섞여 있어 URL에서 다루기 번거롭고,
  // 같은 이름이 재사용될 때 다른 게임의 이미지를 덮어쓸 위험이 있다.
  const key = `${game.id}.${ext}`;

  const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  });
  if (!up.ok) {
    failed.push(`${game.title_ko}: 업로드 ${up.status} ${await up.text()}`);
    return;
  }

  const patch = await fetch(`${URL_BASE}/rest/v1/games?id=eq.${game.id}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ image_path: key }),
  });
  if (!patch.ok) {
    failed.push(`${game.title_ko}: image_path 기록 ${patch.status} ${await patch.text()}`);
    return;
  }

  done++;
  const saved = sharp ? ` ${(buf.length / 1024) | 0}KB → ${(body.length / 1024) | 0}KB` : '';
  console.log(`  [${done}/${targets.length}] ${game.title_ko}${saved}`);
}

// 동시 요청 수를 제한한다. 92장을 한꺼번에 올리면 Storage가 429를 낸다.
const queue = [...targets];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const g = queue.shift();
      if (g) await processOne(g);
    }
  })
);

console.log(`\n완료: ${done}종 업로드`);
if (missing.length) {
  console.log(`\n로컬 파일 없음 (${missing.length}건):`);
  missing.forEach((m) => console.log(`  - ${m}`));
}
if (failed.length) {
  console.log(`\n실패 (${failed.length}건):`);
  failed.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
