/**
 * 앱 아이콘 생성 — 주사위(5) 디자인을 팔레트 색으로 렌더링한다.
 *
 *   node scripts/generate-icons.mjs
 *
 * 산출물:
 *   assets/images/favicon.png  (48)  — 브라우저 탭 파비콘 (app.json web.favicon)
 *   public/icon-192.png        (192) — PWA 홈 화면·apple-touch-icon
 *   public/icon-512.png        (512) — PWA 설치 아이콘 (maskable 겸용)
 *
 * 색은 src/constants/theme.ts의 종이(#F7F2E9)·테라코타(#C24E2B)와 동일하다.
 * maskable 안전 영역(중앙 80% 원) 안에 주사위가 들어오도록 크기를 잡았다.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PAPER = '#F7F2E9';
const TERRACOTTA = '#C24E2B';
const TERRACOTTA_DEEP = '#9E3E20';

// 512 기준 도안: 종이색 라운드 배경 위에 살짝 기울인 테라코타 주사위(5).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="112" fill="${PAPER}"/>
  <g transform="rotate(-10 256 256)">
    <rect x="106" y="120" width="300" height="300" rx="64" fill="${TERRACOTTA_DEEP}"/>
    <rect x="106" y="106" width="300" height="300" rx="64" fill="${TERRACOTTA}"/>
    <circle cx="181" cy="181" r="30" fill="${PAPER}"/>
    <circle cx="331" cy="181" r="30" fill="${PAPER}"/>
    <circle cx="256" cy="256" r="30" fill="${PAPER}"/>
    <circle cx="181" cy="331" r="30" fill="${PAPER}"/>
    <circle cx="331" cy="331" r="30" fill="${PAPER}"/>
  </g>
</svg>`;

const targets = [
  { file: 'assets/images/favicon.png', size: 48 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
];

for (const { file, size } of targets) {
  const out = path.join(root, file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`✓ ${file} (${size}×${size})`);
}
