/* 삼촌의 AI 회사 — Service Worker
 * 설치 시 핵심 파일을 미리 캐시하고, 요청은 캐시 우선(없으면 네트워크)으로 응답합니다.
 * 한 번 설치하면 비행기 모드·오프라인에서도 앱이 그대로 열립니다.
 * 캐시 이름을 올리면(v1 → v2) 설치된 앱이 새 화면을 받습니다.
 */
"use strict";

var CACHE_NAME = "ai-company-v6";
var PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        /* GitHub Pages는 파일을 10분간 HTTP 캐시로 내려줍니다. 그 예전 사본이
         * 새 캐시에 들어가지 않도록, 설치할 때는 캐시를 건너뛰고 새로 받습니다. */
        var requests = PRECACHE.map(function (url) {
          try { return new Request(url, { cache: "reload" }); } catch (e) { return url; }
        });
        return cache.addAll(requests).catch(function () {
          /* 일부 파일이 없어도 설치는 계속 진행 */
          return undefined;
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (key) { return key !== CACHE_NAME; })
              .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) {
        /* 캐시 우선 — 뒤에서 조용히 최신본으로 갱신 */
        event.waitUntil(
          fetch(request).then(function (response) {
            if (response && response.ok) {
              return caches.open(CACHE_NAME).then(function (cache) {
                return cache.put(request, response.clone());
              });
            }
            return undefined;
          }).catch(function () { return undefined; })
        );
        return cached;
      }

      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === "basic") {
          var copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(function (cache) {
              return cache.put(request, copy);
            }).catch(function () { return undefined; })
          );
        }
        return response;
      }).catch(function () {
        /* 오프라인 — 화면 이동 요청은 앱 첫 화면으로 되돌린다 */
        if (request.mode === "navigate") {
          return caches.match("./index.html").then(function (page) {
            return page || new Response("오프라인 상태입니다. 연결 후 다시 열어 주세요.",
              { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
          });
        }
        return new Response("오프라인 상태입니다.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      });
    })
  );
});
