/**
 * MeePick 오프라인 셸.
 *
 * NAS가 꺼져 있거나 와이파이가 끊기면 지금은 앱이 아예 열리지 않는다 — 홈 화면에
 * 아이콘이 있어도 회색 오류 페이지가 뜬다. 껍데기만이라도 뜨면 "앱이 죽었다"가 아니라
 * "지금 연결이 안 된다"가 되고, 그 차이가 크다.
 *
 * 데이터(Supabase)까지 오프라인으로 만들지는 않는다. 글·일정·기록은 인터넷 너머에 있고,
 * 여기서 캐시한 옛 데이터를 최신인 척 보여 주면 "분명히 올렸는데 없다"는 혼란만 생긴다.
 * 이 워커가 맡는 건 **화면을 띄우는 데 필요한 파일**뿐이다.
 *
 * 전략:
 *   - 화면 이동(HTML): 네트워크 먼저, 실패하면 캐시. 배포하면 곧바로 새 화면이 뜬다.
 *   - /_expo/ 번들·CSS: 캐시 먼저. 파일명에 해시가 박혀 있어 내용이 바뀌면 이름도 바뀐다.
 *   - /media/ 사진: 캐시 먼저 + 개수 상한. 사진은 uuid라 역시 안 바뀐다.
 *   - 그 밖(Supabase 등 다른 오리진): 손대지 않는다.
 */
const SHELL_CACHE = 'meepick-shell-v1';
const MEDIA_CACHE = 'meepick-media-v1';
const KEEP = [SHELL_CACHE, MEDIA_CACHE];

/** 사진 캐시 상한(장). 넘으면 오래된 것부터 버린다. 200장이면 대략 40~60MB다. */
const MEDIA_LIMIT = 200;

/** 이 크기를 넘는 사진은 캐시하지 않는다 — 움짤 몇 개가 캐시를 통째로 먹는 걸 막는다. */
const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

self.addEventListener('install', (event) => {
  // 첫 화면만 미리 담아 둔다. 나머지 해시 파일명은 빌드마다 달라 여기서 알 수 없다 —
  // 어차피 한 번 열고 나면 아래 fetch 핸들러가 다 담는다.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.json', '/icon-192.png']))
      // 아이콘 하나가 없다고 워커 설치 자체가 실패하면 오프라인 기능이 통째로 사라진다.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      // 새로고침 없이 지금 열려 있는 탭부터 이 워커가 맡는다.
      .then(() => self.clients.claim())
  );
});

/** 캐시가 상한을 넘으면 오래된 항목부터 지운다(넣은 순서대로 쌓인다). */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  // 206(부분 응답)·오류는 담지 않는다. 반쪽 파일을 캐시하면 다음부터 계속 깨진다.
  if (res.ok && res.status === 200) {
    const size = Number(res.headers.get('content-length') ?? 0);
    if (cacheName !== MEDIA_CACHE || size <= MEDIA_MAX_BYTES) {
      await cache.put(request, res.clone());
      if (cacheName === MEDIA_CACHE) void trim(MEDIA_CACHE, MEDIA_LIMIT);
    }
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (e) {
    // 이 주소의 캐시가 없으면 첫 화면이라도 준다 — expo는 라우트마다 html을 따로 만드는데,
    // 어느 화면이든 같은 앱이 뜨므로 '/'로 대신해도 사용자가 보는 결과는 같다.
    const hit = (await cache.match(request)) ?? (await cache.match('/'));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 다른 오리진(Supabase API·Storage)은 통과시킨다. 인증 토큰이 붙는 요청을
  // 캐시에 남기는 건 그 자체로 위험하다.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_expo/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (url.pathname.startsWith('/media/') && !url.pathname.startsWith('/media/upload')) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
  }
});
