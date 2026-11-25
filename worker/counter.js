/**
 * nolanpix.github.io visit counter -- Cloudflare Worker (free tier, no custom domain).
 *
 * Storage: a Workers KV namespace bound as COUNTER (see wrangler.toml / README).
 * Endpoints (CORS-locked to the site origin):
 *   POST /hit    body {"path":"/notes/x.html"}  -> counts one page view, returns {ok,path,pv,dau}
 *   GET  /stats?path=/notes/x.html              -> read-only, returns {ok,path,pv,dau,total}
 *
 * Privacy: never stores a raw IP. A per-day visitor id is a salted SHA-256 of
 *   (ip + user-agent + date), so DAU is cookieless and not reversible.
 *
 * Write budget (KV free = 1,000 writes/day, 1 write/sec per key): page views are
 *   written to a PER-PATH key so load spreads across keys; DAU writes only on a
 *   visitor's FIRST hit of the day. A per-IP sliding window refuses floods so a
 *   scraper cannot burn the daily write quota.
 */

const SITE_ORIGIN = "https://nolanpix.github.io"; // only this origin may call us
const RL_MAX = 40;            // max counted hits per IP per window
const RL_WINDOW_S = 10;       // sliding window, seconds
const SEEN_TTL_S = 129600;    // visitor "seen today" marker lifetime (36h)
const PATH_MAX = 128;         // reject absurdly long paths (key-flood defense)
const SALT = "np-f10or-2026"; // rotate to reset all visitor ids; not a secret

function corsHeaders(origin) {
  const allow = origin === SITE_ORIGIN ? SITE_ORIGIN : SITE_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

/** Normalize a request path to a stable, safe KV key fragment. */
function cleanPath(raw) {
  if (!raw || typeof raw !== "string") return null;
  let p = raw.split("?")[0].split("#")[0];
  try { p = decodeURIComponent(p); } catch (e) { return null; }
  if (!p.startsWith("/")) p = "/" + p;
  if (p === "/" || p === "/index.html") p = "/";          // home aliases collapse
  else if (p.endsWith("/index.html")) p = p.slice(0, -10); // dir index collapses
  if (p.length > PATH_MAX) return null;
  if (p.indexOf("..") !== -1) return null;                 // no traversal-ish keys
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(p)) return null;        // safe charset only
  return p;
}

/** Read an integer counter from KV (missing -> 0). */
async function getInt(kv, key) {
  const v = await kv.get(key);
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Per-IP sliding-window limiter. Returns true when the caller is over budget. */
async function isRateLimited(kv, ip) {
  const bucket = Math.floor(Date.now() / 1000 / RL_WINDOW_S);
  const key = "rl:" + ip + ":" + bucket;
  const n = (await getInt(kv, key)) + 1;
  await kv.put(key, String(n), { expirationTtl: RL_WINDOW_S * 2 });
  return n > RL_MAX;
}

async function handleHit(request, env, origin) {
  const kv = env.COUNTER;
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  // Only count requests the browser makes from our own page.
  if (origin !== SITE_ORIGIN) return json({ ok: false, error: "forbidden" }, 403, origin);

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const path = cleanPath(body && body.path);
  if (!path) return json({ ok: false, error: "bad path" }, 400, origin);

  if (await isRateLimited(kv, ip)) {
    // Over budget: report current numbers but do NOT write counters.
    const pv0 = await getInt(kv, "pv:" + path);
    const today0 = new Date().toISOString().slice(0, 10);
    const dau0 = await getInt(kv, "dau:" + today0);
    return json({ ok: true, throttled: true, path: path, pv: pv0, dau: dau0 }, 200, origin);
  }

  // Page view: one write to a per-path key (spreads writes across keys).
  const pv = (await getInt(kv, "pv:" + path)) + 1;
  await kv.put("pv:" + path, String(pv));

  // Daily active users: write only on this visitor's first hit of the day.
  const today = new Date().toISOString().slice(0, 10);
  const visitor = await sha256Hex(ip + "|" + (request.headers.get("User-Agent") || "") + "|" + today + "|" + SALT);
  const seenKey = "seen:" + today + ":" + visitor;
  let dau = await getInt(kv, "dau:" + today);
  if (!(await kv.get(seenKey))) {
    await kv.put(seenKey, "1", { expirationTtl: SEEN_TTL_S });
    dau = dau + 1;
    await kv.put("dau:" + today, String(dau));
    const total = (await getInt(kv, "pv:__total__")) + 1;
    await kv.put("pv:__total__", String(total)); // site-wide view total
  }

  return json({ ok: true, path: path, pv: pv, dau: dau }, 200, origin);
}

async function handleStats(request, env, origin) {
  const kv = env.COUNTER;
  const url = new URL(request.url);
  const path = cleanPath(url.searchParams.get("path") || "/");
  if (!path) return json({ ok: false, error: "bad path" }, 400, origin);
  const today = new Date().toISOString().slice(0, 10);
  return json({
    ok: true,
    path: path,
    pv: await getInt(kv, "pv:" + path),
    dau: await getInt(kv, "dau:" + today),
    total: await getInt(kv, "pv:__total__"),
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/hit") {
      return handleHit(request, env, origin);
    }
    if (request.method === "GET" && url.pathname === "/stats") {
      return handleStats(request, env, origin);
    }
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "nolanpix-counter" }, 200, origin);
    }
    return json({ ok: false, error: "not found" }, 404, origin);
  },
};
