/*
 * nolanpix.github.io visit-counter client.
 *
 * Injects a tiny status badge (this page's views + today's visitors) in the
 * bottom-left corner. Talks to the Cloudflare Worker in /worker (see its README).
 *
 * Wire-up: every page just needs one line before </body>:
 *     <script defer src="assets/stats.js"></script>   (notes use ../assets/stats.js)
 *
 * Until the Worker is deployed the badge stays hidden -- no broken zeros, no errors.
 * Write-frugal: a page is counted at most once per 30 min per browser (localStorage);
 * repeat views in that window just read the current numbers. That protects the KV
 * free-tier write budget and stops refresh-spam from inflating counts.
 */
(function () {
  "use strict";

  /* ===== CONFIG: paste your deployed Worker URL here, then commit =====
   * e.g.  "https://nolanpix-counter.nolanpix.workers.dev"   (no trailing slash)
   * Leave empty to keep the badge hidden. You can also set it WITHOUT editing
   * this file, via either of:
   *     <meta name="np-stats-endpoint" content="https://...workers.dev">
   *     <script>window.NP_STATS_ENDPOINT = "https://...workers.dev";</script>
   */
  var STATS_ENDPOINT = "https://nolanpix-counter.song66666.workers.dev/";
  /* ==================================================================== */

  var HIT_TTL_MS = 1800000; // 30 min: min gap between counted hits per page

  function resolveEndpoint() {
    if (window.NP_STATS_ENDPOINT) return String(window.NP_STATS_ENDPOINT);
    var meta = document.querySelector('meta[name="np-stats-endpoint"]');
    if (meta && meta.content) return meta.content;
    return STATS_ENDPOINT;
  }

  var endpoint = resolveEndpoint().replace(/\/+$/, "");
  if (!endpoint) return; // not configured yet -> stay invisible

  // Normalize the path exactly like the Worker (home + dir-index collapse),
  // so client and server agree on the KV key.
  function currentPath() {
    var p = location.pathname || "/";
    if (p === "" || p === "/index.html") return "/";
    if (p.length > 11 && p.slice(-11) === "/index.html") return p.slice(0, -10);
    return p;
  }

  function fmt(value) {
    var n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function buildBadge() {
    var bar = document.createElement("div");
    bar.className = "statbar";
    bar.hidden = true;
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("title", "views on this page / unique visitors today");
    bar.innerHTML =
      '<span class="sb-dot" aria-hidden="true"></span>' +
      '<span class="sb-item"><b class="sb-views">-</b>&nbsp;views</span>' +
      '<span class="sb-sep" aria-hidden="true">/</span>' +
      '<span class="sb-item"><b class="sb-dau">-</b>&nbsp;today</span>';
    return bar;
  }

  function render(bar, data) {
    if (!data || !data.ok) return;
    bar.querySelector(".sb-views").textContent = fmt(data.pv);
    bar.querySelector(".sb-dau").textContent = fmt(data.dau);
    bar.hidden = false;
  }

  function readLast(key) {
    try { return parseInt(localStorage.getItem(key) || "0", 10) || 0; }
    catch (e) { return 0; }
  }

  function query(path) {
    var key = "np:hit:" + path;
    var fresh = Date.now() - readLast(key) > HIT_TTL_MS;
    if (fresh) {
      return fetch(endpoint + "/hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path }),
        keepalive: true,
        cache: "no-store",
      }).then(function (r) { return r.json(); }).then(function (data) {
        // Mark the page as counted only once the Worker confirmed the hit.
        if (data && data.ok) {
          try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
        }
        return data;
      });
    }
    // Counted here recently -> read-only, no write.
    return fetch(endpoint + "/stats?path=" + encodeURIComponent(path), {
      cache: "no-store",
    }).then(function (r) { return r.json(); });
  }

  function start() {
    var bar = buildBadge();
    document.body.appendChild(bar);
    query(currentPath())
      .then(function (data) { render(bar, data); })
      .catch(function () { /* offline / not deployed: leave the badge hidden */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
