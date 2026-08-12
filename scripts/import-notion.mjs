/**
 * 노션 CSV → supabase/seed.sql 변환 (+ 선택적으로 DB 직접 반영).
 *
 * 노션 내보내기를 새로 받았을 때 이 스크립트를 다시 돌리면 seed.sql이 갱신된다.
 * 손으로 seed.sql을 고치지 않는다 — 다음 임포트 때 덮어써진다.
 *
 *   node scripts/import-notion.mjs           # seed.sql만 재생성
 *   node scripts/import-notion.mjs --apply   # DB에 동기화까지 (업서트 + 노션에서 빠진 행 삭제)
 *
 * --apply는 .env의 SUPABASE_SECRET_KEY가 필요하며 다음 순서로 동작한다:
 *   1. 제목(title_ko) 기준 업서트 — last_played_at·image_path·notes는 건드리지 않는다
 *   2. 표지 파일이 바뀐 게임의 image_path를 비운다 (upload-images.mjs가 재업로드하도록)
 *   3. 노션에 더 이상 없는 제목의 행을 삭제한다 (플레이 기록도 cascade로 함께 삭제됨)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTION_DIR = join(ROOT, '_workspace', '00_input', 'notion');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const OUT_SEED = join(ROOT, 'supabase', 'seed.sql');
/** 마이그레이션 + 시드를 합친 파일. Supabase SQL Editor에 한 번에 붙여넣기 위한 것. */
const OUT_SETUP = join(ROOT, 'supabase', 'setup_all.sql');
const OUT_REPORT = join(ROOT, '_workspace', '02_data_import_report.md');

/* ── 추정값 ────────────────────────────────────────────────────────────────
 * 노션에 핵심 속성이 비어 있는 게임 중, 널리 알려져 값을 확인할 수 있는 것만 채운다.
 * 모르는 게임은 채우지 않는다 — 추측한 인원/난이도는 추천 결과를 조용히 왜곡한다.
 * 여기 채운 값은 estimated_fields에 기록되어 앱에서 "추정" 배지로 노출된다.
 */
const ESTIMATES = {
  '아줄':            { players: [2,3,4],                 recommended: [2,4],    best: 2, time: [30,45],  weight: 1.8, categories: ['추상'] },
  '어콰이어':         { players: [2,3,4,5,6],             recommended: [4,5],    best: 4, time: [90,90],  weight: 2.5, categories: ['전략'] },
  '사보타지':         { players: [3,4,5,6,7,8,9,10],      recommended: [6,7,8],  best: 8, time: [30,30],  weight: 1.3, categories: ['파티'] },
  '스컬킹':          { players: [2,3,4,5,6,7,8],         recommended: [5,6],    best: 6, time: [30,30],  weight: 1.3, categories: ['파티'] },
  '스타트업스':       { players: [3,4,5,6,7],             recommended: [5,6],    best: 5, time: [20,20],  weight: 1.3, categories: ['전략'] },
  '옛날 옛적에':      { players: [2,3,4,5,6],             recommended: [4,5],    best: 4, time: [30,30],  weight: 1.6, categories: ['파티'] },
  '마작':            { players: [4],                     recommended: [4],      best: 4, time: [60,90],  weight: 3.0, categories: ['전략'] },
  '블랙 프라이데이':   { players: [3,4,5],                 recommended: [4,5],    best: 5, time: [60,90],  weight: 3.2, categories: ['전략'] },
  '스마트폰 주식회사':  { players: [1,2,3,4,5],            recommended: [4],      best: 4, time: [60,90],  weight: 3.2, categories: ['전략'] },
  '스틱스택':         { players: [2,3,4,5,6,7,8],         recommended: [4,5],    best: 4, time: [15,15],  weight: 1.1, categories: ['파티','어린이'] },
  '오리지널 마피아':   { players: [6,7,8,9,10],            recommended: [8,9,10], best: 9, time: [30,30],  weight: 1.0, categories: ['파티'], tenPlus: true },
};

/* 게임이 아닌 행 — 목록에서 제외한다. */
const NOT_A_GAME = ['보드엠 대형 플레이매트'];

/* ── CSV 파서 (RFC4180) ──────────────────────────────────────────────────── */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/* ── 필드 파서 ───────────────────────────────────────────────────────────── */
const splitMulti = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** '3인, 4인, 10인+' → { counts: [3,4,10], tenPlus: true } */
function parseCounts(v) {
  let tenPlus = false;
  const counts = [];
  for (const tok of splitMulti(v)) {
    if (tok.includes('+')) tenPlus = true;
    const n = parseInt(tok, 10);
    if (Number.isFinite(n)) counts.push(n);
  }
  return { counts: [...new Set(counts)].sort((a, b) => a - b), tenPlus };
}

/** '30–45' | '10-20' | '15' → [min, max]. en-dash와 hyphen 모두 처리한다. */
function parsePlaytime(v) {
  if (!v) return [null, null];
  const m = v.match(/^(\d+)\s*[–\-~]\s*(\d+)$/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? [n, n] : [null, null];
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/* ── SQL 리터럴 ──────────────────────────────────────────────────────────── */
const sqlText = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const sqlNum = (v) => (v === null || v === undefined ? 'null' : String(v));
const sqlBool = (v) => (v ? 'true' : 'false');
const sqlIntArr = (a) => `'{${a.join(',')}}'`;
const sqlTextArr = (a) =>
  a.length ? `ARRAY[${a.map(sqlText).join(',')}]::text[]` : `'{}'::text[]`;

/* ── 실행 ────────────────────────────────────────────────────────────────── */
if (!existsSync(NOTION_DIR)) {
  console.error(`노션 내보내기 폴더가 없습니다: ${NOTION_DIR}`);
  process.exit(1);
}
const csvName = readdirSync(NOTION_DIR).find((f) => f.endsWith('.csv') && !f.endsWith('_all.csv'));
if (!csvName) {
  console.error(`CSV를 찾지 못했습니다: ${NOTION_DIR}`);
  process.exit(1);
}

const imagesOnDisk = new Set(
  readdirSync(NOTION_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
);

const raw = parseCsv(readFileSync(join(NOTION_DIR, csvName), 'utf8'));
const games = [];
const needsInput = [];   // 인원 정보가 없어 추천에 걸리지 않는 게임
const imageMisses = [];
const skipped = [];
const duplicates = [];   // 제목이 같아 첫 행만 반영된 것들
const invalidValues = []; // 범위 밖이라 비운 값들 — 노션에서 고쳐야 한다
const seenTitles = new Set();

for (const r of raw) {
  const title = (r['게임'] ?? '').trim();
  if (!title) continue;
  if (NOT_A_GAME.includes(title)) { skipped.push(title); continue; }
  // title_ko가 DB 고유 키다. 노션에 같은 제목이 여러 행이면(에디션 구분 누락 등)
  // 첫 행만 반영하고 보고한다 — 조용히 덮어쓰면 어느 행이 남았는지 알 수 없다.
  if (seenTitles.has(title)) { duplicates.push(title); continue; }
  seenTitles.add(title);

  const est = ESTIMATES[title];
  const estimatedFields = [];

  let { counts: playerCounts, tenPlus } = parseCounts(r['가능 인원']);
  let { counts: recommended } = parseCounts(r['추천 인원']);
  let best = parseCounts(r['베스트']).counts[0] ?? null;
  let [minTime, maxTime] = parsePlaytime(r['플레이타임']);
  let weight = num(r['난이도']);
  let categories = splitMulti(r['카테고리']);

  // 난이도는 1.0~5.0이다. 범위 밖(예: 소수점 누락 오타 '132')을 그대로 보내면
  // DB 제약에 걸려 임포트 전체가 실패한다. 지어내지 않고 비운 뒤 보고한다.
  if (weight !== null && (weight < 1 || weight > 5)) {
    invalidValues.push(`${title}: 난이도 '${r['난이도']}' — 1~5 범위 밖이라 비움 (소수점 누락 오타인지 노션에서 확인)`);
    weight = null;
  }

  if (est) {
    if (!playerCounts.length) { playerCounts = est.players; tenPlus = tenPlus || !!est.tenPlus; estimatedFields.push('player_counts'); }
    if (!recommended.length)  { recommended = est.recommended; estimatedFields.push('recommended_counts'); }
    if (best === null)        { best = est.best; estimatedFields.push('best_count'); }
    if (minTime === null)     { [minTime, maxTime] = est.time; estimatedFields.push('playtime'); }
    if (weight === null)      { weight = est.weight; estimatedFields.push('weight'); }
    if (!categories.length)   { categories = est.categories; estimatedFields.push('categories'); }
  }

  // 룰 영상 — 노션 '룰 영상' 속성(URL). http(s)가 아니면 오타로 보고 버리되 보고한다.
  let ruleVideoUrl = null;
  const rawVideo = (r['룰 영상'] ?? '').trim();
  if (rawVideo) {
    if (/^https?:\/\//i.test(rawVideo)) ruleVideoUrl = rawVideo;
    else invalidValues.push(`${title}: 룰 영상 '${rawVideo}' — URL 형식이 아니라 비움`);
  }

  // 노션 CSV의 이미지 값은 URL 인코딩되어 있다 ('image%201.png' → 'image 1.png').
  // 디코딩하지 않으면 92건 중 33건만 매칭된다.
  let imageFile = null;
  if (r['이미지']) {
    const decoded = decodeURIComponent(r['이미지']);
    if (imagesOnDisk.has(decoded)) imageFile = decoded;
    else imageMisses.push(`${title} → ${r['이미지']}`);
  }

  if (!playerCounts.length) needsInput.push(title);

  games.push({
    title_ko: title,
    title_en: r['영문 이름'] || null,
    owned: r['상태'] === '소장',
    player_counts: playerCounts,
    recommended_counts: recommended,
    best_count: best,
    supports_10_plus: tenPlus,
    min_playtime: minTime,
    max_playtime: maxTime,
    weight,
    categories,
    themes: splitMulti(r['테마']),
    mechanics: splitMulti(r['메커니즘']),
    year_published: int(r['출시 연도']),
    image_file: imageFile,
    rule_video_url: ruleVideoUrl,
    description: r['설명'] || null,
    is_estimated: estimatedFields.length > 0,
    estimated_fields: estimatedFields,
  });
}

/* seed.sql */
const values = games.map((g) => `  (${[
  sqlText(g.title_ko), sqlText(g.title_en), sqlBool(g.owned),
  sqlIntArr(g.player_counts), sqlIntArr(g.recommended_counts), sqlNum(g.best_count), sqlBool(g.supports_10_plus),
  sqlNum(g.min_playtime), sqlNum(g.max_playtime), sqlNum(g.weight),
  sqlTextArr(g.categories), sqlTextArr(g.themes), sqlTextArr(g.mechanics),
  sqlNum(g.year_published), sqlText(g.image_file), sqlText(g.rule_video_url), sqlText(g.description),
  sqlBool(g.is_estimated), sqlTextArr(g.estimated_fields),
].join(', ')})`).join(',\n');

/* 제목을 자연 키로 삼아 upsert한다. truncate 후 재삽입하면 노션에 없는 정보
 * — 앱에서 추가한 게임, 플레이 기록(last_played_at), 업로드한 표지 경로(image_path) —
 * 가 매번 사라진다. 그래서 갱신 대상에서 그 세 가지를 제외한다. */
const UPSERT_COLUMNS = [
  'title_en', 'owned',
  'player_counts', 'recommended_counts', 'best_count', 'supports_10_plus',
  'min_playtime', 'max_playtime', 'weight',
  'categories', 'themes', 'mechanics',
  'year_published', 'image_file', 'rule_video_url', 'description',
  'is_estimated', 'estimated_fields',
];

const seed = `-- 자동 생성 파일. 직접 수정하지 말고 \`node scripts/import-notion.mjs\`로 다시 만든다.
-- 출처: _workspace/00_input/notion/${csvName}
-- 게임 ${games.length}종 (소장 ${games.filter((g) => g.owned).length} / 미소장 ${games.filter((g) => !g.owned).length})
--
-- 제목 기준 upsert다. 여러 번 실행해도 안전하며,
-- 플레이 기록(last_played_at)·표지 경로(image_path)·앱에서 추가한 게임은 보존된다.

insert into public.games (
  title_ko, title_en, owned,
  player_counts, recommended_counts, best_count, supports_10_plus,
  min_playtime, max_playtime, weight,
  categories, themes, mechanics,
  year_published, image_file, rule_video_url, description,
  is_estimated, estimated_fields
) values
${values}
on conflict (title_ko) do update set
${UPSERT_COLUMNS.map((c) => `  ${c} = excluded.${c}`).join(',\n')};
`;
writeFileSync(OUT_SEED, seed, 'utf8');

/* setup_all.sql — 마이그레이션을 파일명 순으로 이어붙이고 시드를 뒤에 둔다.
 * 시드의 on conflict가 unique 제약에 의존하므로 순서를 바꾸지 않는다. */
const migrations = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  : [];
const setup = [
  `-- 자동 생성 파일. \`node scripts/import-notion.mjs\`로 다시 만든다.`,
  `-- Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run 하면 스키마와 데이터가 한 번에 들어간다.`,
  ...migrations.map((f) => `\n-- ══ migrations/${f} ══\n${readFileSync(join(MIGRATIONS_DIR, f), 'utf8')}`),
  `\n-- ══ seed.sql ══\n${seed}`,
].join('\n');
writeFileSync(OUT_SETUP, setup, 'utf8');

/* 리포트 */
const themeCount = new Map();
for (const g of games) for (const t of g.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
const topThemes = [...themeCount.entries()].sort((a, b) => b[1] - a[1]);

const report = `# 임포트 리포트

출처: \`_workspace/00_input/notion/${csvName}\`
생성: \`supabase/seed.sql\`

## 결과
- 임포트: **${games.length}종** (소장 ${games.filter((g) => g.owned).length} / 미소장·관심 ${games.filter((g) => !g.owned).length})
- 추정값으로 보완: **${games.filter((g) => g.is_estimated).length}종**
- 이미지 연결: ${games.filter((g) => g.image_file).length}종
- 게임이 아니라 제외: ${skipped.length ? skipped.join(', ') : '없음'}
- 제목 중복으로 첫 행만 반영: ${duplicates.length ? duplicates.join(', ') : '없음'}
- 범위 밖이라 비운 값: ${invalidValues.length ? '\n' + invalidValues.map((v) => `  - ${v}`).join('\n') : '없음'}

## 인원 정보가 없어 추천에 잡히지 않는 게임 (${needsInput.length}종)
인원수는 하드 필터라, 값이 없으면 어떤 인원으로 검색해도 후보에 오르지 않는다.
노션에서 '가능 인원'을 채우고 다시 내보내거나, 앱에서 직접 입력해야 한다.

${needsInput.map((t) => `- ${t}`).join('\n') || '- 없음'}

## 추정값을 넣은 게임 (${games.filter((g) => g.is_estimated).length}종)
${games.filter((g) => g.is_estimated).map((g) => `- ${g.title_ko} — ${g.estimated_fields.join(', ')}`).join('\n') || '- 없음'}

## 이미지 미연결 (${imageMisses.length}건)
${imageMisses.map((m) => `- ${m}`).join('\n') || '- 없음'}

## 테마 분포 (전 ${topThemes.length}종)
${topThemes.map(([t, c]) => `- ${t}: ${c}`).join('\n')}
`;
writeFileSync(OUT_REPORT, report, 'utf8');

console.log(`games=${games.length} estimated=${games.filter((g) => g.is_estimated).length} images=${games.filter((g) => g.image_file).length} needsInput=${needsInput.length} duplicates=${duplicates.length}`);
console.log(`→ ${OUT_SEED}`);
console.log(`→ ${OUT_SETUP}`);
console.log(`→ ${OUT_REPORT}`);

/* ── --apply: DB 동기화 ─────────────────────────────────────────────────── */
if (process.argv.includes('--apply')) {
  const env = {};
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
  const SECRET = env.SUPABASE_SECRET_KEY;
  if (!URL_BASE || !SECRET) {
    console.error('--apply에는 .env의 EXPO_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.');
    process.exit(1);
  }
  const H = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

  // 현재 DB 상태 — 표지 변경 감지와 삭제 대상 계산은 업서트 전 값 기준이어야 한다.
  const before = await (
    await fetch(`${URL_BASE}/rest/v1/games?select=id,title_ko,image_file,image_path,last_played_at&limit=1000`, {
      headers: H,
    })
  ).json();
  if (!Array.isArray(before)) {
    console.error(`DB 조회 실패: ${JSON.stringify(before)}`);
    process.exit(1);
  }
  const byTitle = new Map(before.map((r) => [r.title_ko, r]));
  const csvTitleSet = new Set(games.map((g) => g.title_ko));

  // 표지 파일이 바뀐 게임 — 업로드 경로를 비워 재업로드를 유도한다.
  const staleImage = games
    .map((g) => ({ g, db: byTitle.get(g.title_ko) }))
    .filter(({ g, db }) => db && db.image_path && db.image_file !== g.image_file)
    .map(({ db }) => db);

  // 노션에서 사라진 제목 — 삭제. 플레이 기록이 있으면 cascade로 함께 지워지므로 표시한다.
  const toDelete = before.filter((r) => !csvTitleSet.has(r.title_ko));

  // 1. 업서트. last_played_at·image_path·notes는 payload에 없어 보존된다.
  const payload = games.map((g) => ({
    title_ko: g.title_ko,
    title_en: g.title_en,
    owned: g.owned,
    player_counts: g.player_counts,
    recommended_counts: g.recommended_counts,
    best_count: g.best_count,
    supports_10_plus: g.supports_10_plus,
    min_playtime: g.min_playtime,
    max_playtime: g.max_playtime,
    weight: g.weight,
    categories: g.categories,
    themes: g.themes,
    mechanics: g.mechanics,
    year_published: g.year_published,
    image_file: g.image_file,
    rule_video_url: g.rule_video_url,
    description: g.description,
    is_estimated: g.is_estimated,
    estimated_fields: g.estimated_fields,
  }));
  const up = await fetch(`${URL_BASE}/rest/v1/games?on_conflict=title_ko`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!up.ok) {
    console.error(`업서트 실패 (${up.status}): ${await up.text()}`);
    process.exit(1);
  }
  console.log(`APPLY: 업서트 ${payload.length}종`);

  // 2. 표지 재업로드 유도
  if (staleImage.length) {
    const ids = staleImage.map((r) => r.id).join(',');
    const clear = await fetch(`${URL_BASE}/rest/v1/games?id=in.(${ids})`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ image_path: null }),
    });
    if (!clear.ok) {
      console.error(`image_path 초기화 실패 (${clear.status}): ${await clear.text()}`);
      process.exit(1);
    }
  }
  console.log(`APPLY: 표지 변경으로 재업로드 대상 ${staleImage.length}종`);

  // 3. 노션에서 빠진 행 삭제
  if (toDelete.length) {
    const ids = toDelete.map((r) => r.id).join(',');
    const del = await fetch(`${URL_BASE}/rest/v1/games?id=in.(${ids})`, {
      method: 'DELETE',
      headers: { ...H, Prefer: 'return=minimal' },
    });
    if (!del.ok) {
      console.error(`삭제 실패 (${del.status}): ${await del.text()}`);
      process.exit(1);
    }
    for (const r of toDelete) {
      console.log(`APPLY: 삭제 — ${r.title_ko}${r.last_played_at ? ' (플레이 기록 함께 삭제됨)' : ''}`);
    }
  } else {
    console.log('APPLY: 삭제 대상 없음');
  }

  const after = await (
    await fetch(`${URL_BASE}/rest/v1/games?select=id&limit=1000`, { headers: H })
  ).json();
  console.log(`APPLY: 완료 — DB ${after.length}종 (CSV 고유 제목 ${games.length}종)`);
}
