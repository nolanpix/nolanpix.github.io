/* nolanpix.github.io: public counters and a same-origin, owner-only traffic report.
 * Deploy this single ES module. D1 binding DB; existing KV COUNTER is read only at cutover.
 * OAuth and password verification are server-side; see worker/README.md for provisioning. */
const SITE = 'https://nolanpix.github.io';
const ADMIN = 'https://nolanpix-counter.song66666.workers.dev';
const OWNER = 361057995;
const DAY = 86400000, MIN = 60000, RETAIN = 365;
const COOKIE = '__Host-np_admin', FLOW = '__Host-np_flow';
const enc = new TextEncoder();
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g), p => parseInt(p, 16));
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const digest = s => crypto.subtle.digest('SHA-256', enc.encode(s));
const hash = async s => hex(await digest(s));
const stmt = (db, sql, ...values) => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
const one = (db, sql, ...values) => stmt(db, sql, ...values).first();

// Admin-facing messages in Chinese; English lives in the [lang="en"] twin.
const ZH = {
  'Request too large.':'请求内容过大。',
  'D1 binding DB is not configured.':'尚未配置 D1 数据库绑定 DB。',
  'Keep the previous COUNTER KV binding for initial import.':'首次导入数据前，请保留原来的 COUNTER KV 绑定。',
  'Invalid legacy counter; inspect KV before retrying.':'旧计数数据有误，请先检查 KV 再重试。',
  'Counters are being imported; retry shortly.':'正在导入历史计数，请稍后重试。',
  'Invalid report window or timezone offset.':'报表时间范围或时区参数无效。',
  'Owner sign-in is not configured.':'站长登录尚未配置。',
  'GitHub could not verify the sign-in. Start again.':'GitHub 无法验证这次登录，请重新开始。',
  'Sign-in expired or cancelled. Start again.':'登录已过期或已取消，请重新开始。',
  'GitHub did not authorize this sign-in. Start again.':'GitHub 未授权这次登录，请重新开始。',
  'This report is only available to its owner. Choose the owner account on GitHub.':'报表只对站长开放。请在 GitHub 上选择站长账号。',
  'Sign in with GitHub first.':'请先用 GitHub 登录。',
  'Use the password form.':'请通过密码表单提交。',
  'Too many attempts. Try again in 15 minutes.':'尝试次数过多，请 15 分钟后再试。',
  'Password not accepted. Try again.':'密码不正确，请重试。',
  'Sign in again.':'请重新登录。',
  'Invalid form origin.':'表单来源无效。',
  'Not found.':'找不到该页面。',
  'Both GitHub sign-in and the owner password are required.':'需要先完成 GitHub 登录并输入站长密码。',
  'Service temporarily unavailable.':'服务暂时不可用。'
};
const both = (zh, en) => `<span lang="zh-CN">${zh}</span><span lang="en">${en}</span>`;
class Status extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function smallBody(req, limit = 4096) {
  if (Number(req.headers.get('Content-Length')) > limit) throw new Status(413, 'Request too large.');
  const reader = req.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let size = 0, text = '';
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Status(413, 'Request too large.'); }
    text += decoder.decode(value, {stream:true});
  }
  return text + decoder.decode();
}
function cleanPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 512) return null;
  let p; try { p = decodeURIComponent(raw.split(/[?#]/, 1)[0]); } catch { return null; }
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/index.html')) p = p.slice(0, -10);
  return p.length <= 128 && /^\/[a-zA-Z0-9_./-]*$/.test(p) && !p.includes('..') && !p.includes('//') && !p.startsWith('/admin') ? p : null;
}
function publicHeaders(req) {
  const h = new Headers({'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'});
  if (req.headers.get('Origin') === SITE) {
    h.set('Access-Control-Allow-Origin', SITE); h.set('Access-Control-Allow-Headers','Content-Type');
    h.set('Access-Control-Allow-Methods','GET, POST, OPTIONS'); h.set('Access-Control-Max-Age','86400');
  }
  return h;
}
function publicJson(req, body, status = 200) { return Response.json(body, {status, headers:publicHeaders(req)}); }
const schema = [
  'CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS page_totals(path TEXT PRIMARY KEY, pv INTEGER NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS day_totals(day TEXT PRIMARY KEY, pv INTEGER NOT NULL, dau INTEGER NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS salts(day TEXT PRIMARY KEY, salt TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS seen(day TEXT, vid TEXT, PRIMARY KEY(day,vid)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS hits(at INTEGER, id TEXT, path TEXT NOT NULL, vid TEXT NOT NULL, ref TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, browser TEXT NOT NULL, os TEXT NOT NULL, first_visit INTEGER NOT NULL, PRIMARY KEY(at,id)) WITHOUT ROWID',
  "CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, stage TEXT NOT NULL CHECK(stage IN ('password','full')), expires INTEGER NOT NULL) WITHOUT ROWID",
  'CREATE TABLE IF NOT EXISTS auth_fail(owner INTEGER PRIMARY KEY, attempts INTEGER NOT NULL, until INTEGER NOT NULL) WITHOUT ROWID'
];
let schemaReady = false, imported = false, cutover = '', daily = null;
async function database(env) {
  const db = env.DB;
  if (!db) throw new Status(503, 'D1 binding DB is not configured.');
  if (!schemaReady) {
    await db.batch(schema.map(sql => db.prepare(sql)));
    schemaReady = true;
  }
  return db;
}
// Page the old, now read-only namespace; copy only real counters, never old rate keys or old totals.
// Each cursor and its rows commit together. Unfinished imports never accept new hits.
async function importCounts(db, env) {
  if (imported) return;
  for (let pass = 0; pass < 2; pass++) {
    const previous = (await one(db, "SELECT v FROM meta WHERE k='import'"))?.v || '';
    if (previous.startsWith('done:')) { cutover = previous.slice(5); imported = true; return; }
    if (!env.COUNTER) throw new Status(503, 'Keep the previous COUNTER KV binding for initial import.');
    const [kind, cursor] = previous ? JSON.parse(previous) : ['pv:', ''];
    const page = await env.COUNTER.list({prefix:kind, limit:15, ...(cursor ? {cursor} : {})});
    const keys = page.keys.map(k => k.name).filter(k => kind === 'pv:' ? k.startsWith('pv:/') && cleanPath(k.slice(3)) === k.slice(3) : /^dau:\d{4}-\d\d-\d\d$/.test(k));
    const values = keys.length ? await env.COUNTER.get(keys) : new Map();
    const rows = keys.map(key => {
      const value = values.get(key);
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Status(503, 'Invalid legacy counter; inspect KV before retrying.');
      return kind === 'pv:' ? stmt(db,'INSERT OR IGNORE INTO page_totals VALUES (?,?)',key.slice(3),Number(value)) : stmt(db,'INSERT OR IGNORE INTO day_totals VALUES (?,0,?)',key.slice(4),Number(value));
    });
    const now = Date.now(), next = !page.list_complete ? JSON.stringify([kind,page.cursor]) : kind === 'pv:' ? JSON.stringify(['dau:','']) : 'done:'+iso(now);
    if (next.startsWith('done:')) rows.push(stmt(db,"INSERT OR IGNORE INTO meta VALUES ('tracked_since',?)",String(now)));
    rows.push(stmt(db,"INSERT INTO meta VALUES ('import',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE meta.v=?",next,previous));
    await db.batch(rows);
    if (next.startsWith('done:')) { cutover = next.slice(5); imported = true; return; }
    if (!page.list_complete) break;
  }
  throw new Status(503, 'Counters are being imported; retry shortly.');
}
async function prune(db, now) {
  const expiredDay = iso(now-2*DAY);
  await db.batch([
    stmt(db,'DELETE FROM hits WHERE at<?', now-RETAIN*DAY),
    stmt(db,'DELETE FROM salts WHERE day<=?', expiredDay), stmt(db,'DELETE FROM seen WHERE day<=?',expiredDay),
    stmt(db,'DELETE FROM sessions WHERE expires<=?',now), stmt(db,'DELETE FROM auth_fail WHERE until<=?',now)
  ]);
}
async function dailyKey(db, now) {
  const day = iso(now);
  if (daily?.day === day) return daily.salt;
  const [,r] = await db.batch([stmt(db,'INSERT OR IGNORE INTO salts VALUES (?,lower(hex(randomblob(32))))',day),stmt(db,'SELECT salt FROM salts WHERE day=?',day)]);
  await prune(db, now);
  daily = {day, salt:r.results[0].salt}; return daily.salt;
}
let windowStart = -1, limitSalt = '', counts = new Map();
async function overBudget(ip, now) {
  const w = Math.floor(now / 10000);
  if (w !== windowStart) { windowStart = w; counts = new Map(); limitSalt = random(); }
  const map = counts, key = (await hash(limitSalt+'|'+ip)).slice(0,32);
  const n = map.get(key) || 0;
  if (n >= 40 || (!n && map.size >= 8192)) return true;
  map.set(key,n+1); return false;
}
function source(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 2048) return 'Direct';
  try {
    const u = new URL(raw.includes('://') ? raw : 'https://'+raw);
    if (!['http:','https:'].includes(u.protocol)) return 'Direct';
    if (u.hostname === new URL(SITE).hostname) return 'Internal';
    return /^[a-z0-9.-]+\.[a-z][a-z0-9-]+$/i.test(u.hostname) ? u.hostname.slice(0,253) : 'Other';
  } catch { return 'Direct'; }
}
function classify(ua) {
  const device = /bot|crawler|spider|slurp/i.test(ua) ? 'Bot' : /ipad|tablet|android(?!.*mobile)/i.test(ua) ? 'Tablet' : /mobi|iphone|ipod/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /edg[a-z]*\//i.test(ua) ? 'Edge' : /firefox|fxios/i.test(ua) ? 'Firefox' : /opr\//i.test(ua) ? 'Opera' : /chrome|crios|chromium/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return [device,browser,os];
}
async function counters(db,path,day) {
  const r = await one(db,'SELECT coalesce((SELECT pv FROM page_totals WHERE path=?),0) pv, coalesce((SELECT dau FROM day_totals WHERE day=?),0) dau',path,day);
  return {ok:true,path,pv:r.pv,dau:r.dau};
}
async function publicRoute(req,env,u) {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:publicHeaders(req)});
  if (req.method === 'GET' && u.pathname === '/') return publicJson(req,{ok:true,service:'nolanpix-counter'});
  const isHit = req.method === 'POST' && u.pathname === '/hit';
  if (!isHit && !(req.method === 'GET' && u.pathname === '/stats')) throw new Status(404,'Not found.');
  if (isHit && req.headers.get('Origin') !== SITE) throw new Status(403,'Forbidden.');
  let body;
  if (isHit) { const text = await smallBody(req); try { body = JSON.parse(text); } catch { throw new Status(400,'Invalid JSON.'); } }
  const path = cleanPath(isHit ? body?.path : (u.searchParams.get('path') || '/'));
  if (!path) throw new Status(400,'Invalid page path.');
  const now = Date.now(), day = iso(now), ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const throttled = isHit && await overBudget(ip, now);
  const db = await database(env); await importCounts(db, env);
  if (!isHit || throttled) return publicJson(req,{...await counters(db,path,day),...(throttled ? {throttled:true} : {})});
  const ua = (req.headers.get('User-Agent') || '').slice(0,512), salt = await dailyKey(db,now);
  const vid = (await hash(JSON.stringify([salt,ip,ua]))).slice(0,16);
  // During the UTC day of migration, do not count a known legacy visitor twice.
  const legacy = day === cutover && env.COUNTER && await env.COUNTER.get('seen:'+day+':'+await hash([ip,ua,day,'np-f10or-2026'].join('|')));
  const cfCountry = req.cf?.country || req.headers.get('CF-IPCountry') || '';
  const country = /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : 'Unknown';
  const id = crypto.randomUUID();
  const result = await db.batch([
    stmt(db,'INSERT OR IGNORE INTO seen VALUES (?,?)',day,vid),
    stmt(db,'INSERT INTO hits VALUES (?,?,?,?,?,?,?,?,?,changes()*?)',now,id,path,vid,source(body.ref),country,...classify(ua),legacy ? 0 : 1),
    stmt(db,'INSERT INTO day_totals VALUES (?,1,(SELECT first_visit FROM hits WHERE at=? AND id=?)) ON CONFLICT(day) DO UPDATE SET pv=pv+1,dau=dau+excluded.dau RETURNING dau',day,now,id),
    stmt(db,'INSERT INTO page_totals VALUES (?,1) ON CONFLICT(path) DO UPDATE SET pv=pv+1 RETURNING pv',path)
  ]);
  return publicJson(req,{ok:true,path,pv:result[3].results[0].pv,dau:result[2].results[0].dau});
}

function reportOptions(u) {
  const days = Number(u.searchParams.get('days') ?? 30), offset = Number(u.searchParams.get('offset') ?? 0);
  if (![7,30,90,365].includes(days) || !Number.isInteger(offset) || Math.abs(offset)>840) throw new Status(400,'Invalid report window or timezone offset.');
  return {days,offset};
}
// Short display names for report paths ("/notes/x.html" -> "宏单元摆放"), published by the site in
// assets/pages.json (written by tools/gen_notes.py), so new pages need no Worker redeploy. Best effort.
async function pageNames() {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 2000);
  try {
    const r = await fetch(SITE+'/assets/pages.json',{cf:{cacheTtl:600,cacheEverything:true},signal:ctl.signal});
    const j = r.ok ? await r.json() : {};
    return Object.fromEntries(Object.entries(j && typeof j === 'object' ? j : {}).filter(([p,v]) => cleanPath(p) === p && Array.isArray(v) && v.length === 2 && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 40)));
  } catch { return {}; } finally { clearTimeout(timer); }
}
async function report(db, {days,offset}, now) {
  const today = Math.floor((now+offset*MIN)/DAY)*DAY-offset*MIN;
  const start = today-(days-1)*DAY, shift = offset*60, filter = ' FROM hits WHERE at BETWEEN ? AND ?';
  const grouped = `date(at/1000+?, 'unixepoch')`;
  const rankDefs = [['paths','path'],['entries','path',' AND first_visit=1'],['referrers','ref'],['countries','country'],['devices','device'],['browsers','browser'],['systems','os']];
  const [[perDay,heat,info,latest,...sets],pages] = await Promise.all([db.batch([
    stmt(db,`SELECT ${grouped} day, count(*) views, count(DISTINCT vid) visitors${filter} GROUP BY day ORDER BY day`,shift,start,now),
    stmt(db,`SELECT cast(strftime('%w',at/1000+?,'unixepoch') AS INTEGER) weekday, cast(strftime('%H',at/1000+?,'unixepoch') AS INTEGER) hour, count(*) views${filter} GROUP BY weekday,hour`,shift,shift,start,now),
    stmt(db,"SELECT (SELECT coalesce(SUM(pv),0) FROM page_totals) lifetimeViews, (SELECT v FROM meta WHERE k='tracked_since') trackedSince, (SELECT count(*) FROM hits WHERE at>=? AND at<?) previousViews",start-days*DAY,start),
    stmt(db,'SELECT at,path,ref,country,device,browser,os,first_visit'+filter+' ORDER BY at DESC,id DESC LIMIT 50',start,now),
    ...rankDefs.map(([,col,extra='']) => stmt(db,`SELECT ${col} label,count(*) n${filter}${extra} GROUP BY ${col} ORDER BY n DESC,label LIMIT 10`,start,now))
  ]),pageNames()]);
  const infoRow = info.results[0], trackedSince = Number(infoRow.trackedSince), byDay = new Map(perDay.results.map(r=>[r.day,r]));
  const trend = Array.from({length:days}, (_,i) => { const day = iso(start+offset*MIN+i*DAY); return byDay.get(day) || {day,views:0,visitors:0}; });
  const last = trend.at(-1), ranks = Object.fromEntries(rankDefs.map(([key],i)=>[key,sets[i].results]));
  return {ok:true,days,offset,updated:now,trackedSince,lifetimeViews:infoRow.lifetimeViews,
    totals:{views:trend.reduce((n,d)=>n+d.views,0),visitorDays:trend.reduce((n,d)=>n+d.visitors,0),previousViews:start-days*DAY >= Math.max(trackedSince,now-RETAIN*DAY) ? infoRow.previousViews : null,todayViews:last.views,todayVisitors:last.visitors},
    trend,hours:heat.results,ranks,events:latest.results,pages};
}

function adminHeaders(type = 'text/html; charset=utf-8') {
  return new Headers({'Content-Type':type,'Cache-Control':'private, no-store','Vary':'Cookie',
    'Content-Security-Policy':`default-src 'none'; script-src 'self'; style-src ${SITE} https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`,
    'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff',
    'Permissions-Policy':'geolocation=(), camera=(), microphone=()'});
}
function privateReply(body, status = 200, type, cookies = []) {
  const h = adminHeaders(type);
  for (const c of cookies) h.append('Set-Cookie',c);
  return new Response(body,{status,headers:h});
}
function page(stage, message = '', status = 200, cookies = []) {
  const response = privateReply(adminPage(stage,message),status,undefined,cookies);
  // Native form POSTs need their same-origin Origin; never send a referrer off-site.
  if (stage === 'password' || stage === 'report') response.headers.set('Referrer-Policy','same-origin');
  return response;
}
function redirect(loc, cookies = [], status = 303) {
  const h = adminHeaders(); h.set('Location',loc); for (const c of cookies) h.append('Set-Cookie',c);
  return new Response(null,{status,headers:h});
}
const cookie = (key,value,age) => `${key}=${value}; Max-Age=${age}; Path=/; Secure; HttpOnly; SameSite=Lax`;
function readCookie(req,name) {
  const prefix = name+'=', parts = (req.headers.get('Cookie') || '').split(';').map(s=>s.trim()).filter(s=>s.startsWith(prefix));
  return parts.length === 1 ? parts[0].slice(prefix.length) : '';
}
function passwordParams(env) {
  const m = /^pbkdf2-sha256\$(\d{6})\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(env.ADMIN_PASSWORD_HASH || '');
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !m || +m[1]<100000 || +m[1]>600000) throw new Status(503,'Owner sign-in is not configured.');
  return {iterations:+m[1], salt:unhex(m[2]), expected:unhex(m[3])};
}
async function flowKey(env) {
  return crypto.subtle.importKey('raw',enc.encode(env.GITHUB_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const flowMessage = s => enc.encode('np:admin:oauth:v1:'+s);
async function startLogin(env) {
  passwordParams(env);
  const state = random(), verifier = random(), until = Date.now()+10*MIN;
  const value = [state,verifier,until].join('.');
  const sig = hex(await crypto.subtle.sign('HMAC',await flowKey(env),flowMessage(value)));
  const args = new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:ADMIN+'/admin/callback',scope:'',state,code_challenge:b64(await digest(verifier)),code_challenge_method:'S256',allow_signup:'false',prompt:'select_account'});
  return redirect('https://github.com/login/oauth/authorize?'+args,[cookie(FLOW,value+'.'+sig,600)],302);
}
async function githubJson(url,init) {
  const r = await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Status(502,'GitHub could not verify the sign-in. Start again.');
  return r.json();
}
async function callback(req,env,u) {
  passwordParams(env);
  const clear = [cookie(FLOW,'',0)], raw = readCookie(req,FLOW);
  const m = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.(\d{13})\.([a-f0-9]{64})$/.exec(raw);
  const code = u.searchParams.get('code');
  if (!m || !code || code.length>512 || m[1] !== u.searchParams.get('state') || +m[3] <= Date.now() || +m[3]>Date.now()+10*MIN || !await crypto.subtle.verify('HMAC',await flowKey(env),unhex(m[4]),flowMessage(raw.slice(0,-65)))) {
    return page('login','Sign-in expired or cancelled. Start again.',400,clear);
  }
  const tokens = await githubJson('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,redirect_uri:ADMIN+'/admin/callback',code,code_verifier:m[2]}).toString()});
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) return page('login','GitHub did not authorize this sign-in. Start again.',401,clear);
  const who = await githubJson('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+tokens.access_token,'User-Agent':'nolanpix-traffic-report','X-GitHub-Api-Version':'2022-11-28'}});
  if (who.id !== OWNER) return page('login','This report is only available to its owner. Choose the owner account on GitHub.',403,clear);
  const db = await database(env), token = random(), now = Date.now();
  // A consumed GitHub authorization code cannot be exchanged again. Never reuse the OAuth flow cookie as the session.
  await stmt(db,"INSERT INTO sessions VALUES (?,'password',?)",await hash(token),now+5*MIN).run();
  return redirect('/admin',[...clear,cookie(COOKIE,token,300)]);
}
async function session(req,env) {
  const token = readCookie(req,COOKIE);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  passwordParams(env);
  const db = await database(env), key = await hash(token);
  const row = await one(db,'SELECT stage FROM sessions WHERE digest=? AND expires>?',key,Date.now());
  return row ? {db,key,stage:row.stage} : null;
}
async function submitPassword(req,env,s) {
  if (s?.stage !== 'password') throw new Status(401,'Sign in with GitHub first.');
  if (req.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') throw new Status(415,'Use the password form.');
  const db = s.db, now = Date.now();
  const lock = () => { const r = page('password','Too many attempts. Try again in 15 minutes.',429); r.headers.set('Retry-After','900'); return r; };
  if (await one(db,'SELECT 1 FROM auth_fail WHERE owner=? AND attempts>=5 AND until>?',OWNER,now)) return lock();
  const input = new URLSearchParams(await smallBody(req)).get('password') || '';
  const params = passwordParams(env); let correct = false;
  if (input.length && input.length<=512) {
    const k = await crypto.subtle.importKey('raw',enc.encode(input),'PBKDF2',false,['deriveBits']);
    const actual = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:params.salt,iterations:params.iterations},k,256);
    correct = crypto.subtle.timingSafeEqual(actual,params.expected);
  }
  if (!correct) {
    const fail = await stmt(db,`INSERT INTO auth_fail VALUES (?,1,?) ON CONFLICT(owner) DO UPDATE SET attempts=CASE WHEN until<=? THEN 1 ELSE attempts+1 END, until=excluded.until WHERE until<=? OR attempts<5 RETURNING attempts`,OWNER,now+15*MIN,now,now).first();
    return !fail || fail.attempts>=5 ? lock() : page('password','Password not accepted. Try again.',401);
  }
  const next = random(), id = await hash(next), checkTime = Date.now();
  const [upgrade] = await db.batch([
    stmt(db,"UPDATE sessions SET digest=?,stage='full',expires=? WHERE digest=? AND expires>? AND stage='password' AND NOT EXISTS(SELECT 1 FROM auth_fail WHERE owner=? AND attempts>=5 AND until>?) RETURNING stage",id,checkTime+12*60*MIN,s.key,checkTime,OWNER,checkTime),
    stmt(db,'DELETE FROM auth_fail WHERE owner=? AND changes()=1',OWNER)
  ]);
  if (!upgrade.results.length) throw new Status(401,'Sign in again.');
  return redirect('/admin',[cookie(COOKIE,next,12*3600)]);
}
async function adminRoute(req,env,u) {
  if (u.origin !== ADMIN) throw new Status(404,'Not found.');
  const p = u.pathname;
  if (req.method === 'POST' && req.headers.get('Origin') !== ADMIN) throw new Status(403,'Invalid form origin.');
  if (p === '/admin/login' && req.method === 'GET') return startLogin(env);
  if (p === '/admin/callback' && req.method === 'GET') return callback(req,env,u);
  const s = await session(req,env);
  if (req.method === 'POST' && p === '/admin/logout') {
    if (s) await stmt(s.db,'DELETE FROM sessions WHERE digest=?',s.key).run();
    return redirect('/admin',[cookie(COOKIE,'',0),cookie(FLOW,'',0)]);
  }
  if (req.method === 'POST' && p === '/admin/password') return submitPassword(req,env,s);
  if (req.method === 'GET' && p === '/admin/prefs.js') {
    const r = privateReply('('+adminPrefs.toString()+')();',200,'application/javascript; charset=utf-8');
    r.headers.set('Cache-Control','public, max-age=3600'); r.headers.delete('Vary'); return r;
  }
  if (req.method === 'GET' && (p === '/admin' || p === '/admin/')) return page(s?.stage==='full' ? 'report' : s?.stage || 'login');
  if (req.method === 'GET' && (p === '/admin/ui.js' || p === '/admin/api/report')) {
    if (s?.stage !== 'full') throw new Status(401,'Both GitHub sign-in and the owner password are required.');
    if (p.endsWith('.js')) return privateReply('('+dashboardClient.toString()+')();',200,'application/javascript; charset=utf-8');
    const options = reportOptions(u); await importCounts(s.db,env);
    return privateReply(JSON.stringify(await report(s.db,options,Date.now())),200,'application/json; charset=utf-8');
  }
  throw new Status(404,'Not found.');
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url), admin = u.pathname==='/admin' || u.pathname.startsWith('/admin/');
    try { return await (admin ? adminRoute(req,env,u) : publicRoute(req,env,u)); }
    catch (error) {
      const status = error instanceof Status ? error.status : 500;
      const message = error instanceof Status ? error.message : 'Service temporarily unavailable.';
      if (status>=500) console.error('traffic-service',admin ? 'admin' : 'counter',status); // no URL, visitor data, authorization code or binding values
      if (!admin) return publicJson(req,{ok:false,error:message},status);
      if (u.pathname.startsWith('/admin/api/') || u.pathname.endsWith('.js')) return privateReply(JSON.stringify({ok:false,error:message}),status,'application/json; charset=utf-8');
      return page('login',message,status,[cookie(FLOW,'',0)]);
    }
  },
  async scheduled(_event,env) { await prune(await database(env),Date.now()); }
};

function adminPage(stage, message = '') {
  const report = stage === 'report', password = stage === 'password';
  const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const alert = message ? `<p class="adm-alert" role="alert">${both(esc(ZH[message] || message), esc(message))}</p>` : '';
  const gate = `<section class="adm-gate"><p class="adm-kicker">${both('站长专用','OWNER ACCESS')} &nbsp; / &nbsp; ${password ? '02' : '01'} OF 02</p><h1>${password ? both('解锁报表。','Unlock your report.') : both('私人工作区。','Private workspace.')}</h1><p>${password ? both('GitHub 身份已验证。请输入单独设置的后台密码。','GitHub identity verified. Enter your separate dashboard password.') : both('仅限管理员：先用站长的 GitHub 账号登录，再输入后台密码。','Admins only: sign in with the owner GitHub account, then confirm your dashboard password.')}</p>${alert}${password?`<form action="/admin/password" method="post"><label for="pw">${both('后台密码','Dashboard password')}</label><input id="pw" name="password" type="password" required maxlength="512" autocomplete="current-password"><button type="submit">${both('解锁报表','Unlock report')}</button></form><form action="/admin/logout" method="post"><button class="adm-plain" type="submit">${both('换一个账号','Use another account')}</button></form>`:`<a class="adm-button" href="/admin/login">${both('用 GitHub 登录','Continue with GitHub')} <span aria-hidden="true">→</span></a>`}</section>`;
  const labels = [['views','页面浏览量','Page views'],['visitorDays','访客天数','Visitor-days'],['average','每访客天浏览','Views / visitor-day'],['today','今日 · 浏览 / 访客','Today · views / visitors']];
  const ranks = [['paths','页面','Pages'],['entries','入口页','Entry pages'],['referrers','来源域名','Referring domains'],['countries','国家/地区','Countries'],['devices','设备','Devices'],['browsers','浏览器','Browsers'],['systems','操作系统','Operating systems']];
  const panel = `<div class="adm-head"><div><p class="adm-kicker">NP. / ${both('站长统计','OWNER ANALYTICS')}</p><h1>${both('访问报表','Traffic report')}<span class="adm-mark">.</span></h1></div><div class="adm-controls"><div role="group" aria-label="报表时间范围" data-aria-en="Report window" id="windows">${[7,30,90,365].map(n=>`<button type="button" data-days="${n}" aria-pressed="${n===30}">${both(n+' 天',n+'d')}</button>`).join('')}</div><button id="refresh" type="button">${both('刷新','Refresh')}</button></div></div><p id="notice" role="status" aria-live="polite">${both('正在加载报表…','Loading the report…')}</p><div id="report-data" hidden><div class="adm-kpis">${labels.map(([id,zh,en])=>`<div><span>${both(zh,en)}</span><strong id="v-${id}">—</strong></div>`).join('')}</div><p id="coverage" class="adm-caption"></p><section class="adm-panel"><header><div><p class="adm-kicker">01 / ${both('波形','WAVEFORM')}</p><h2>${both('每日访问','Daily traffic')}</h2></div><p class="adm-key"><i></i>${both('浏览','Views')} &nbsp; <i></i>${both('访客','Visitors')}</p></header><div id="wave"></div><details><summary>${both('查看每日数值','Read daily values')}</summary><div class="adm-scroll" id="daily-values"></div></details></section><section class="adm-panel"><header><div><p class="adm-kicker">02 / ${both('活跃时段','ACTIVITY MAP')}</p><h2>${both('读者何时访问','When readers visit')}</h2></div><small>${both('星期 × 小时','Weekday × hour')}</small></header><div id="heat"></div></section><section class="adm-panel"><header><div><p class="adm-kicker">03 / ${both('细分','BREAKDOWN')}</p><h2>${both('访问来源','Where visits come from')}</h2></div><small>${both('按浏览量前 10','Top 10 by views')}</small></header><div class="adm-ranks">${ranks.map(([id,zh,en])=>`<section><h3>${both(zh,en)}</h3><ol id="rank-${id}"></ol></section>`).join('')}</div></section><section class="adm-panel"><header><div><p class="adm-kicker">04 / ${both('访问日志','EVENT LOG')}</p><h2>${both('最近访问','Recent visits')}</h2></div><small>${both('时间范围内最新 50 条','Latest 50 in window')}</small></header><div class="adm-scroll" id="event-log"></div></section></div>`;
  const icons = '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  const prefs = `<button class="pref" type="button" data-pref="lang">${both('EN','中文')}</button><button class="pref" type="button" data-pref="theme">${icons}</button>`;
  const title = report ? ['访问报表','Traffic report'] : ['站长入口','Owner access'];
  return `<!doctype html><html lang="zh-CN" data-lang="zh" data-title-en="${title[1]} · Nolan Pierce"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title[0]} · Nolan Pierce</title><link rel="stylesheet" href="${SITE}/assets/style.css"><link rel="stylesheet" href="${SITE}/assets/admin.css"><script src="/admin/prefs.js?v=4"></script>${report?'<script src="/admin/ui.js" defer></script>':''}</head><body class="adm-body"><a class="adm-skip" href="#main">${both('跳到正文','Skip to content')}</a><header class="adm-top"><div><a class="brand" data-site-link href="${SITE}/"><span class="np">np.</span> <span>${both('现场笔记','field notes')}</span></a><span class="adm-part">/ &nbsp;${both('后台','admin')}</span><span class="adm-spacer"></span>${report?`<form action="/admin/logout" method="post"><button class="adm-plain" type="submit">${both('退出登录','Sign out')}</button></form>`:`<a class="adm-back" data-site-link href="${SITE}/">${both('返回博客','Back to blog')}</a>`}${prefs}</div></header><main id="main" class="adm-main">${report?panel:gate}</main><footer class="adm-foot">Nolan Pierce &nbsp; / &nbsp; ${both('私人统计 · 仅管理员可见','Private analytics · admins only')}</footer></body></html>`;
}

// Theme / language for the admin pages only. Its own keys (npa:*): this origin does not
// share storage with the public site. Served same-origin so the CSP (script-src 'self') allows it.
function adminPrefs() {
  'use strict';
  const root = document.documentElement, zhTitle = document.title;
  const system = matchMedia('(prefers-color-scheme: light)');
  const WORDS = {zh:{lang:'Switch to English',dark:'切换到浅色模式',light:'切换到深色模式'},en:{lang:'切换到中文',dark:'Switch to light mode',light:'Switch to dark mode'}};
  const load = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const savedTheme = () => { const t = load('npa:theme'); return t === 'light' || t === 'dark' ? t : null; };
  const setTheme = t => root.setAttribute('data-theme', t);
  // Back to the blog (and the brand) must carry the dashboard's tone and language too,
  // so leaving never lands on a site still showing its older saved choices.
  function syncSiteLinks() {
    const theme = root.dataset.theme, lang = root.dataset.lang;
    document.querySelectorAll('a[data-site-link]').forEach(a => {
      try { const u = new URL(a.getAttribute('href'), location.href); u.searchParams.set('theme', theme); u.searchParams.set('lang', lang); a.setAttribute('href', u.href); } catch {}
    });
  }
  // A link from the public site carries ?theme=light|dark and ?lang=zh|en: this origin
  // cannot read np:*. Apply them, remember them for the following sign-in steps, then
  // drop them from the address bar.
  const fromSite = {};
  try {
    const q = new URLSearchParams(location.search);
    const t = q.get('theme'), l = q.get('lang');
    if (t === 'light' || t === 'dark') fromSite.theme = t;
    if (l === 'zh' || l === 'en') fromSite.lang = l;
  } catch {}
  if (fromSite.theme) save('npa:theme', fromSite.theme);
  if (fromSite.lang) save('npa:lang', fromSite.lang);
  if (fromSite.theme || fromSite.lang) {
    try { const u = new URL(location.href); u.searchParams.delete('theme'); u.searchParams.delete('lang'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch {}
  }
  const setLang = l => { root.setAttribute('data-lang', l); root.lang = l === 'en' ? 'en' : 'zh-CN'; document.title = l === 'en' ? root.dataset.titleEn : zhTitle; };
  setTheme(fromSite.theme || savedTheme() || (system.matches ? 'light' : 'dark'));
  setLang(fromSite.lang || (load('npa:lang') === 'en' ? 'en' : 'zh'));
  function refresh() {
    const lang = root.dataset.lang, w = WORDS[lang];
    document.querySelectorAll('[data-pref="lang"]').forEach(b => { b.setAttribute('aria-label', w.lang); b.title = w.lang; });
    document.querySelectorAll('[data-pref="theme"]').forEach(b => { const t = w[root.dataset.theme]; b.setAttribute('aria-label', t); b.title = t; });
    document.querySelectorAll('[data-aria-en]').forEach(el => { if (!el.hasAttribute('data-aria-zh')) el.setAttribute('data-aria-zh', el.getAttribute('aria-label') || ''); el.setAttribute('aria-label', el.getAttribute(lang === 'en' ? 'data-aria-en' : 'data-aria-zh')); });
    syncSiteLinks();
    document.dispatchEvent(new CustomEvent('npa:lang'));
  }
  function wire() {
    document.querySelectorAll('[data-pref="lang"]').forEach(b => b.addEventListener('click', () => { const l = root.dataset.lang === 'en' ? 'zh' : 'en'; setLang(l); save('npa:lang', l); refresh(); }));
    document.querySelectorAll('[data-pref="theme"]').forEach(b => b.addEventListener('click', () => { const t = root.dataset.theme === 'light' ? 'dark' : 'light'; setTheme(t); save('npa:theme', t); refresh(); }));
    refresh();
  }
  system.addEventListener('change', () => { if (!savedTheme()) { setTheme(system.matches ? 'light' : 'dark'); refresh(); } });
  addEventListener('storage', e => { if (e.key === 'npa:theme' && savedTheme()) setTheme(savedTheme()); if (e.key === 'npa:lang') setLang(e.newValue === 'en' ? 'en' : 'zh'); if (e.key === 'npa:theme' || e.key === 'npa:lang') refresh(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}

function dashboardClient() {
  'use strict';
  const $=id=>document.getElementById(id), num=n=>Number(n).toLocaleString('en-US');
  const zh=()=>document.documentElement.dataset.lang!=='en', t=(z,e)=>zh()?z:e;
  let lastData=null, lastNotice=null, filter=null, active=null;
  const say=(z,e)=>{lastNotice=[z,e];$('notice').textContent=t(z,e);};
  const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const svg=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,val] of Object.entries(attrs))el.setAttribute(name,val);return el;};
  const paint=(tag,parent,attrs,text)=>{const el=svg(tag,attrs);if(text!=null)el.textContent=text;parent.append(el);return el;};
  const pct=(n,d)=>{if(!d)return '—';const v=100*n/d;return (v>0&&v<10?v.toFixed(1):String(Math.round(v)))+'%';};
  const signed=(a,b)=>(a>b?'+':a<b?'−':'±')+pct(Math.abs(a-b),b);
  const avg=(n,k)=>(k?n/k:0).toFixed(1);
  const WD=()=>zh()?['周日','周一','周二','周三','周四','周五','周六']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weekday=day=>WD()[new Date(day+'T00:00:00Z').getUTCDay()];
  let days=30, serial=0, pending=null, last=null, lastTime=0, leaving=false;
  const offset=()=>-new Date().getTimezoneOffset();
  function time(ms,off){return new Date(ms+off*60000).toISOString().slice(0,19).replace('T',' ');}
  function table(title,heads,rows){const t=make('table'),caption=make('caption',title);caption.className='adm-sr';t.append(caption);const thr=t.createTHead().insertRow();for(const h of heads){const c=make('th',h);c.scope='col';thr.append(c);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const val of row){tr.insertCell().textContent=val;}}return t;}

  // One hover card for the whole report. Text only (textContent), positioned through CSSOM, so the CSP needs no inline styles.
  const tip=make('div');tip.className='adm-tip';tip.hidden=true;tip.setAttribute('role','status');tip.setAttribute('aria-live','polite');document.body.append(tip);
  function showTip(owner,clear,title,rows,tags,x,y){
    active={owner,clear};tipY=scrollY;
    const head=make('p',title);head.className='adm-tip-head';const dl=make('dl');
    for(const [k,v] of rows)dl.append(make('dt',k),make('dd',v));
    const parts=[head,dl];
    if(tags.length){const p=make('p');p.className='adm-tip-tags';for(const s of tags)p.append(make('span',s));parts.push(p);}
    tip.replaceChildren(...parts);tip.hidden=false;
    const pad=10,w=tip.offsetWidth,h=tip.offsetHeight;let left=x+16,top=y+16;
    if(left+w>innerWidth-pad)left=x-16-w;if(left<pad)left=pad;if(top+h>innerHeight-pad)top=y-16-h;if(top<pad)top=pad;
    tip.style.left=left+'px';tip.style.top=top+'px';
  }
  function hideTip(owner){if(active&&owner&&active.owner!==owner)return;tip.hidden=true;active=null;}
  document.addEventListener('pointerdown',e=>{if(active&&!active.owner.contains(e.target))active.clear();},true);
  let tipY=0;addEventListener('scroll',()=>{if(active&&Math.abs(scrollY-tipY)>24)active.clear();},{passive:true});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&active)active.clear();});
  function screenPoint(root,px,py){const m=root.getScreenCTM();if(!m)return {x:0,y:0};const p=root.createSVGPoint();p.x=px;p.y=py;const s=p.matrixTransform(m);return {x:s.x,y:s.y};}
  function svgPoint(root,e){const m=root.getScreenCTM();if(!m)return {x:0,y:0};const p=root.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(m.inverse());}

  function chart(rows,tracked){const w=700,h=182,x0=42,x1=w-18,y0=16,y1=h-29;const root=svg('svg',{viewBox:`0 0 ${w} ${h}`,role:'img',tabindex:'0','aria-label':t('每日页面浏览量与每日访客数。悬停、轻点或用左右方向键逐日查看详情。','Daily page views and daily visitors. Hover, tap or use the arrow keys for each day.')});const top=Math.max(1,...rows.map(r=>r.views),...rows.map(r=>r.visitors));const x=i=>x0+(x1-x0)*i/Math.max(1,rows.length-1), y=n=>y1-(y1-y0)*n/top;
    for(const val of new Set([0,Math.round(top/2),top])){paint('line',root,{x1:x0,x2:x1,y1:y(val),y2:y(val),class:'adm-grid'});paint('text',root,{x:x0-7,y:y(val)+4,'text-anchor':'end'},num(val));}
    for(const [field,cl] of [['views','adm-line-pv'],['visitors','adm-line-uv']]){const d=rows.map((r,i)=>i?`H ${x(i).toFixed(1)} V ${y(r[field]).toFixed(1)}`:`M ${x0} ${y(r[field]).toFixed(1)}`).join(' ');paint('path',root,{d,class:cl,fill:'none','vector-effect':'non-scaling-stroke'});}
    if(rows.length){for(const i of new Set([0,Math.floor(rows.length/2),rows.length-1]))paint('text',root,{x:x(i),y:h-6,'text-anchor':i===0?'start':i===rows.length-1?'end':'middle'},rows[i].day.slice(5));}
    if(!rows.length)return root;
    const guide=paint('line',root,{class:'adm-guide',y1:y0-6,y2:y1,visibility:'hidden'});
    const dotPv=paint('circle',root,{r:4.5,class:'adm-dot-pv',visibility:'hidden'}),dotUv=paint('circle',root,{r:3.5,class:'adm-dot-uv',visibility:'hidden'});
    paint('rect',root,{x:x0-8,y:0,width:x1-x0+16,height:h,fill:'transparent'});
    const total=rows.reduce((n,r)=>n+r.views,0),peak=Math.max(...rows.map(r=>r.views));let cur=-1;
    function card(i){const r=rows[i],p=rows[i-1],list=[[t('页面浏览','Page views'),num(r.views)],[t('访客','Visitors'),num(r.visitors)],[t('每访客浏览','Views / visitor'),r.visitors?avg(r.views,r.visitors):'—'],[t('占本期浏览','Share of window'),pct(r.views,total)]];
      if(p){const d=r.views-p.views;list.push([t('较前一日','vs previous day'),(d>0?'+':d<0?'−':'±')+num(Math.abs(d))+(p.views?` (${signed(r.views,p.views)})`:'')]);}
      const tags=[];if(r.day<tracked)tags.push(t('当时尚未开始记录','Before tracking began'));if(i===rows.length-1)tags.push(t('今天 · 仍在统计','Today · still counting'));if(peak&&r.views===peak)tags.push(t('本期峰值','Peak of window'));
      return [`${r.day} · ${weekday(r.day)}`,list,tags];}
    function clear(){cur=-1;for(const el of [guide,dotPv,dotUv])el.setAttribute('visibility','hidden');hideTip(root);}
    function select(i,cx,cy){cur=Math.max(0,Math.min(rows.length-1,i));const X=x(cur);
      for(const [el,a] of [[guide,{x1:X,x2:X}],[dotPv,{cx:X,cy:y(rows[cur].views)}],[dotUv,{cx:X,cy:y(rows[cur].visitors)}]]){for(const [k,v] of Object.entries(a))el.setAttribute(k,v);el.setAttribute('visibility','visible');}
      const at=cx==null?screenPoint(root,X,y(rows[cur].views)):{x:cx,y:cy};showTip(root,clear,...card(cur),at.x,at.y);}
    const index=e=>Math.round((svgPoint(root,e).x-x0)/((x1-x0)/Math.max(1,rows.length-1)));
    root.addEventListener('pointermove',e=>select(index(e),e.clientX,e.clientY));
    root.addEventListener('pointerdown',e=>select(index(e),e.clientX,e.clientY));
    root.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear();});
    root.addEventListener('focus',()=>{if(cur<0)select(rows.length-1);});
    root.addEventListener('blur',clear);
    root.addEventListener('keydown',e=>{const step={ArrowLeft:-1,ArrowRight:1}[e.key],base=cur<0?rows.length-1:cur;
      if(step){e.preventDefault();select(base+step);}else if(e.key==='Home'){e.preventDefault();select(0);}else if(e.key==='End'){e.preventDefault();select(rows.length-1);}});
    return root;
  }

  function heatMap(hours){const names=WD();const map=new Map(hours.map(r=>[r.weekday*24+r.hour,r.views])),max=Math.max(1,...hours.map(h=>h.views)),total=hours.reduce((n,h)=>n+h.views,0);
    const all=[];for(let k=0;k<168;k++)all.push(map.get(k)||0);
    const root=svg('svg',{viewBox:'0 0 678 143',role:'img',tabindex:'0','aria-label':t('按星期和小时统计的访问强度，颜色越深访问越多。悬停、轻点或用方向键查看每个时段。','Traffic intensity by weekday and hour; darker accent means more visits. Hover, tap or use the arrow keys for each slot.')});
    for(let h=0;h<24;h+=3)paint('text',root,{x:46+h*26,y:12},String(h).padStart(2,'0'));
    const cells=[];
    for(let j=0;j<7;j++){const day=(j+1)%7;paint('text',root,{x:0,y:31+j*16},names[day]);cells.push([]);for(let h=0;h<24;h++){const n=map.get(day*24+h)||0;cells[j].push(paint('rect',root,{x:46+h*26,y:21+j*16,width:23,height:12,rx:2,'data-j':j,'data-h':h,class:'adm-level-'+(n?Math.ceil(4*n/max):0)}));}}
    let cj=-1,ch=-1;
    function clear(){cj=ch=-1;root.classList.remove('is-hl');for(const row of cells)for(const c of row)c.classList.remove('is-on','is-cur');hideTip(root);}
    function select(j,h,cx,cy){cj=(j+7)%7;ch=(h+24)%24;const day=(cj+1)%7,n=map.get(day*24+ch)||0;
      root.classList.add('is-hl');cells.forEach((row,r)=>row.forEach((c,k)=>{c.classList.toggle('is-on',r===cj||k===ch);c.classList.toggle('is-cur',r===cj&&k===ch);}));
      let dayTotal=0,hourTotal=0;for(let k=0;k<24;k++)dayTotal+=map.get(day*24+k)||0;for(let d=0;d<7;d++)hourTotal+=map.get(d*24+ch)||0;
      const hh=String(ch).padStart(2,'0'),next=String((ch+1)%24).padStart(2,'0'),rank=1+all.filter(v=>v>n).length;
      const list=[[t('浏览','Views'),num(n)],[t('占本期','Share of window'),pct(n,total)],[t('排名','Rank'),n?t(`第 ${rank} / 168`,`#${rank} of 168`):'—'],[t(`${names[day]}全天`,`All ${names[day]}`),num(dayTotal)],[t(`每周 ${hh} 时合计`,`${hh}:00 across the week`),num(hourTotal)]];
      const tags=n&&n===max?[t('最活跃时段','Busiest slot')]:[];
      const at=cx==null?screenPoint(root,46+ch*26+23,21+cj*16):{x:cx,y:cy};showTip(root,clear,`${names[day]} ${hh}:00–${next}:00`,list,tags,at.x,at.y);}
    const fromEvent=e=>{const j=e.target.getAttribute&&e.target.getAttribute('data-j');if(j!==null&&j!==undefined&&e.target.tagName==='rect')select(+j,+e.target.getAttribute('data-h'),e.clientX,e.clientY);};
    root.addEventListener('pointermove',fromEvent);root.addEventListener('pointerdown',fromEvent);
    root.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear();});
    root.addEventListener('focus',()=>{if(cj<0){let best=0;for(let k=1;k<168;k++)if(all[k]>all[best])best=k;select((Math.floor(best/24)+6)%7,best%24);}});
    root.addEventListener('blur',clear);
    root.addEventListener('keydown',e=>{const mv={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[e.key];if(mv){e.preventDefault();select((cj<0?0:cj)+mv[0],(ch<0?0:ch)+mv[1]);}});
    return root;
  }

  function spark(values,cls){const w=120,h=24,top=Math.max(1,...values),root=svg('svg',{class:'adm-spark '+cls,viewBox:`0 0 ${w} ${h}`,'aria-hidden':'true',preserveAspectRatio:'none'});
    const x=i=>w*i/Math.max(1,values.length-1);paint('path',root,{d:values.map((v,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${(h-2-(h-4)*v/top).toFixed(1)}`).join(' '),'vector-effect':'non-scaling-stroke'});return root;}
  const peakOf=(rows,f)=>rows.reduce((b,r)=>r[f]>(b?b[f]:0)?r:b,null);
  const KPI={
    views:d=>{const r=d.trend,tt=d.totals,pk=peakOf(r,'views'),prev=tt.previousViews;return [t('页面浏览量','Page views'),[[t('本期合计','Window total'),num(tt.views)],[t('日均','Daily average'),avg(tt.views,r.length)],[t('峰值日','Peak day'),pk?`${pk.day.slice(5)} · ${num(pk.views)}`:'—'],[t('较上一时段','vs prior window'),prev===null?t('数据不完整','not fully tracked'):prev?signed(tt.views,prev):(tt.views?t('上一时段为 0','prior window: 0'):'±0%')]],[]];},
    visitorDays:d=>{const r=d.trend,tt=d.totals,pk=peakOf(r,'visitors');return [t('访客天数','Visitor-days'),[[t('本期合计','Window total'),num(tt.visitorDays)],[t('日均访客','Daily visitors'),avg(tt.visitorDays,r.length)],[t('峰值日','Peak day'),pk?`${pk.day.slice(5)} · ${num(pk.visitors)}`:'—'],[t('有访客的天数','Days with visitors'),`${r.filter(x=>x.visitors).length} / ${r.length}`]],[t('跨天不去重','Not de-duplicated across days')]];},
    average:d=>{const r=d.trend.filter(x=>x.visitors),tt=d.totals,best=r.reduce((b,x)=>!b||x.views/x.visitors>b.views/b.visitors?x:b,null);return [t('每访客天浏览','Views / visitor-day'),[[t('本期','Window'),tt.visitorDays?avg(tt.views,tt.visitorDays):'—'],[t('最深的一天','Deepest day'),best?`${best.day.slice(5)} · ${avg(best.views,best.visitors)}`:'—'],[t('计算方式','Formula'),t('浏览 ÷ 访客天数','views ÷ visitor-days')]],[]];},
    today:d=>{const r=d.trend,tt=d.totals,others=r.length>1?(tt.views-tt.todayViews)/(r.length-1):0;return [t('今日','Today'),[[t('浏览','Views'),num(tt.todayViews)],[t('访客','Visitors'),num(tt.todayVisitors)],[t('本期其他日日均','Other days, average'),others.toFixed(1)],[t('相比日均','vs that average'),others?signed(tt.todayViews,others):'—']],[t('今天尚未结束','Day still in progress')]];}
  };
  document.querySelectorAll('.adm-kpis > div').forEach(card=>{const id=card.querySelector('strong')?.id.slice(2);if(!KPI[id])return;card.tabIndex=0;
    const clear=()=>hideTip(card),open=()=>{if(!lastData)return;const r=card.getBoundingClientRect();showTip(card,clear,...KPI[id](lastData),r.left-16,r.bottom-10);};
    card.addEventListener('pointerenter',open);card.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear();});card.addEventListener('pointerdown',open);card.addEventListener('focus',open);card.addEventListener('blur',clear);});

  const RANK={paths:['页面','Page',e=>e.path],entries:['入口页','Entry page',e=>e.first_visit?e.path:null],referrers:['来源域名','Referrer',e=>e.ref],countries:['国家/地区','Country',e=>e.country],devices:['设备','Device',e=>e.device],browsers:['浏览器','Browser',e=>e.browser],systems:['操作系统','OS',e=>e.os]};
  const isPage=k=>k==='paths'||k==='entries';
  function pageName(d,p){const v=d.pages&&d.pages[p];if(v)return zh()?v[0]:v[1];if(p==='/')return t('首页','Home');const m=/^\/notes\/([^/]+)\.html$/.exec(p);return m?m[1]:p;}
  const shown=(d,k,label)=>isPage(k)?pageName(d,label):label;
  function renderRanks(d){for(const [k,list] of Object.entries(d.ranks)){const ol=$('rank-'+k);if(!ol||!RANK[k])continue;
    const base=k==='entries'?d.totals.visitorDays:d.totals.views;
    const items=list.map((r,i)=>{const li=make('li'),b=make('button');b.type='button';b.className='adm-rank';b.setAttribute('aria-controls','event-log');
      const on=!!filter&&filter.key===k&&filter.label===r.label;b.setAttribute('aria-pressed',String(on));b.style.setProperty('--share',(base?Math.min(100,100*r.n/base):0).toFixed(1)+'%');
      const name=shown(d,k,r.label);b.append(make('span',name),make('b',num(r.n)));
      const clear=()=>hideTip(b),open=e=>{const rect=b.getBoundingClientRect(),X=e&&e.clientX!=null?e.clientX:rect.left,Y=e&&e.clientY!=null?e.clientY:rect.bottom-10;
        showTip(b,clear,name,[[t(k==='entries'?'首访进入':'浏览',k==='entries'?'Landings':'Views'),num(r.n)],[t(k==='entries'?'占当日首访':'占本期浏览',k==='entries'?'Share of landings':'Share of window'),pct(r.n,base)],[t('排名','Rank'),t(`第 ${i+1} / ${list.length}`,`#${i+1} of ${list.length}`)],...(isPage(k)?[[t('路径','Path'),r.label]]:[])],[on?t('再次点击取消筛选','Click again to clear the filter'):t('点击后在下方访问日志中筛选','Click to filter the visit log below')],X,Y);};
      b.addEventListener('pointerenter',open);b.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear();});b.addEventListener('focus',()=>open());b.addEventListener('blur',clear);
      b.addEventListener('click',()=>{filter=on?null:{key:k,label:r.label};hideTip();renderRanks(d);renderEvents(d);if(!on&&b.isConnected)b.focus();else{const again=[...document.querySelectorAll('.adm-rank')].find(x=>x.textContent===b.textContent);again?.focus();}});
      li.append(b);return li;});
    ol.replaceChildren(...(items.length?items:[make('li',t('这个时间范围内没有访问。','No visits in this window.'))]));}}
  function renderEvents(d){const box=$('event-log'),match=filter?RANK[filter.key][2]:null;
    const rows=filter?d.events.filter(e=>match(e)===filter.label):d.events,parts=[];
    if(filter){const bar=make('p');bar.className='adm-filter';const clear=make('button',t('清除筛选','Clear filter'));clear.type='button';clear.className='adm-plain';
      clear.addEventListener('click',()=>{filter=null;renderRanks(d);renderEvents(d);});
      bar.append(make('span',t(`筛选：${RANK[filter.key][0]} = ${shown(d,filter.key,filter.label)} · 最近 ${d.events.length} 条中有 ${rows.length} 条`,`Filter: ${RANK[filter.key][1]} = ${shown(d,filter.key,filter.label)} · ${rows.length} of the latest ${d.events.length}`)),clear);parts.push(bar);}
    parts.push(rows.length?table(t('最近访问','Recent visits'),t(['时间','页面','来源','国家/地区','设备 / 浏览器 / 系统','今日首访'],['Time','Page','Source','Country','Device / browser / OS','First today']),rows.map(e=>[time(e.at,d.offset),pageName(d,e.path),e.ref,e.country,[e.device,e.browser,e.os].join(' / '),e.first_visit?t('是','Yes'):'—'])):make('p',filter?t('最近的访问中没有符合筛选的记录。','No recent visits match this filter.'):t('这个时间范围内没有访问记录。','No visits recorded in this window.')));
    box.replaceChildren(...parts);}

  function render(d){if(active)active.clear();lastData=d;const tt=d.totals;for(const [id,value] of Object.entries({views:num(tt.views),visitorDays:num(tt.visitorDays),average:tt.visitorDays?(tt.views/tt.visitorDays).toFixed(1):'—',today:num(tt.todayViews)+' / '+num(tt.todayVisitors)}))$('v-'+id).textContent=value;
    for(const [id,field,cls] of [['views','views','pv'],['visitorDays','visitors','uv']]){const card=$('v-'+id).parentElement;card.querySelector('.adm-spark')?.remove();card.append(spark(d.trend.map(r=>r[field]),cls));}
    const since=time(d.trackedSince,d.offset).slice(0,10);
    const delta=tt.previousViews===null?t('上一时段的数据不完整。','Prior window not fully tracked.'):t(`上一时段 ${num(tt.previousViews)} 次浏览。`,`${num(tt.previousViews)} views in prior window.`);
    $('coverage').textContent=t(`累计 ${num(d.lifetimeViews)} 次页面浏览。自 ${since} 起记录详细数据。${delta}访客天数是每日访客数之和，不是跨天去重后的人数。`,`${num(d.lifetimeViews)} all-time page views. Detailed tracking since ${since}. ${delta} Visitor-days sum daily visitors; not distinct people across days.`);
    $('wave').replaceChildren(chart(d.trend,since));$('daily-values').replaceChildren(table(t('每日合计','Daily totals'),t(['日期','浏览','访客'],['Date','Views','Visitors']),d.trend.map(r=>[r.day,num(r.views),num(r.visitors)])));
    $('heat').replaceChildren(heatMap(d.hours));
    renderRanks(d);renderEvents(d);
    $('report-data').hidden=false;const sign=d.offset<0?'−':'+';const minutes=Math.abs(d.offset);const zone=`UTC${sign}${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,at=time(d.updated,d.offset).slice(11);say(`${d.days} 天范围 · ${zone} · 更新于 ${at}`,`${d.days}-day window · ${zone} · Updated ${at}`);
    document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===d.days)));
  }
  function clearAndLogin(){leaving=true;last=null;pending?.abort();$('report-data').replaceChildren();$('report-data').hidden=true;say('会话已结束，正在返回登录页…','Session ended. Returning to sign-in…');location.replace('/admin');}
  async function load(){if(leaving)return;const id=++serial;pending?.abort();const ctl=new AbortController();pending=ctl;const timer=setTimeout(()=>ctl.abort(),15000);say('正在更新报表…','Updating report…');try{const r=await fetch(`/admin/api/report?days=${days}&offset=${offset()}`,{cache:'no-store',credentials:'same-origin',signal:ctl.signal});if(id!==serial)return;if(r.status===401||r.status===403){clearAndLogin();return;}if(!r.ok)throw Error('unavailable');const d=await r.json();if(id!==serial)return;if(!d.ok)throw Error('unavailable');render(d);last=d.days;lastTime=Date.now();}catch{if(id!==serial||leaving)return;days=last||days;if(last)say(`更新失败 · 仍显示上次成功加载的 ${last} 天报表。点“刷新”重试。`,`Update failed · still showing last successful ${last}-day report. Use Refresh to retry.`);else say('暂无报表，点“刷新”重试。','No report available. Use Refresh to retry.');}finally{clearTimeout(timer);if(id===serial)pending=null;}}
  document.addEventListener('npa:lang',()=>{if(lastData&&!leaving)render(lastData);else if(lastNotice)$('notice').textContent=t(...lastNotice);});
  document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{days=+b.dataset.days;load();}));$('refresh').addEventListener('click',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!pending&&Date.now()-lastTime>60000)load();});window.addEventListener('pageshow',e=>{if(e.persisted){$('report-data').hidden=true;load();}});window.addEventListener('pagehide',()=>{$('report-data').hidden=true;});setInterval(()=>{if(!document.hidden&&!pending)load();},60000);load();
}
