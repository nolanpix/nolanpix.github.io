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
async function report(db, {days,offset}, now) {
  const today = Math.floor((now+offset*MIN)/DAY)*DAY-offset*MIN;
  const start = today-(days-1)*DAY, shift = offset*60, filter = ' FROM hits WHERE at BETWEEN ? AND ?';
  const grouped = `date(at/1000+?, 'unixepoch')`;
  const rankDefs = [['paths','path'],['entries','path',' AND first_visit=1'],['referrers','ref'],['countries','country'],['devices','device'],['browsers','browser'],['systems','os']];
  const [perDay,heat,info,latest,...sets] = await db.batch([
    stmt(db,`SELECT ${grouped} day, count(*) views, count(DISTINCT vid) visitors${filter} GROUP BY day ORDER BY day`,shift,start,now),
    stmt(db,`SELECT cast(strftime('%w',at/1000+?,'unixepoch') AS INTEGER) weekday, cast(strftime('%H',at/1000+?,'unixepoch') AS INTEGER) hour, count(*) views${filter} GROUP BY weekday,hour`,shift,shift,start,now),
    stmt(db,"SELECT (SELECT coalesce(SUM(pv),0) FROM page_totals) lifetimeViews, (SELECT v FROM meta WHERE k='tracked_since') trackedSince, (SELECT count(*) FROM hits WHERE at>=? AND at<?) previousViews",start-days*DAY,start),
    stmt(db,'SELECT at,path,ref,country,device,browser,os,first_visit'+filter+' ORDER BY at DESC,id DESC LIMIT 50',start,now),
    ...rankDefs.map(([,col,extra='']) => stmt(db,`SELECT ${col} label,count(*) n${filter}${extra} GROUP BY ${col} ORDER BY n DESC,label LIMIT 10`,start,now))
  ]);
  const infoRow = info.results[0], trackedSince = Number(infoRow.trackedSince), byDay = new Map(perDay.results.map(r=>[r.day,r]));
  const trend = Array.from({length:days}, (_,i) => { const day = iso(start+offset*MIN+i*DAY); return byDay.get(day) || {day,views:0,visitors:0}; });
  const last = trend.at(-1), ranks = Object.fromEntries(rankDefs.map(([key],i)=>[key,sets[i].results]));
  return {ok:true,days,offset,updated:now,trackedSince,lifetimeViews:infoRow.lifetimeViews,
    totals:{views:trend.reduce((n,d)=>n+d.views,0),visitorDays:trend.reduce((n,d)=>n+d.visitors,0),previousViews:start-days*DAY >= Math.max(trackedSince,now-RETAIN*DAY) ? infoRow.previousViews : null,todayViews:last.views,todayVisitors:last.visitors},
    trend,hours:heat.results,ranks,events:latest.results};
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
  return `<!doctype html><html lang="zh-CN" data-lang="zh" data-title-en="${title[1]} · Nolan Pierce"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title[0]} · Nolan Pierce</title><link rel="stylesheet" href="${SITE}/assets/style.css"><link rel="stylesheet" href="${SITE}/assets/admin.css"><script src="/admin/prefs.js"></script>${report?'<script src="/admin/ui.js" defer></script>':''}</head><body class="adm-body"><a class="adm-skip" href="#main">${both('跳到正文','Skip to content')}</a><header class="adm-top"><div><a class="brand" href="${SITE}/"><span class="np">np.</span> <span>${both('现场笔记','field notes')}</span></a><span class="adm-part">/ &nbsp;${both('后台','admin')}</span><span class="adm-spacer"></span>${report?`<form action="/admin/logout" method="post"><button class="adm-plain" type="submit">${both('退出登录','Sign out')}</button></form>`:`<a class="adm-back" href="${SITE}/">${both('返回博客','Back to blog')}</a>`}${prefs}</div></header><main id="main" class="adm-main">${report?panel:gate}</main><footer class="adm-foot">Nolan Pierce &nbsp; / &nbsp; ${both('私人统计 · 仅管理员可见','Private analytics · admins only')}</footer></body></html>`;
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
  const setLang = l => { root.setAttribute('data-lang', l); root.lang = l === 'en' ? 'en' : 'zh-CN'; document.title = l === 'en' ? root.dataset.titleEn : zhTitle; };
  setTheme(savedTheme() || (system.matches ? 'light' : 'dark'));
  setLang(load('npa:lang') === 'en' ? 'en' : 'zh');
  function refresh() {
    const lang = root.dataset.lang, w = WORDS[lang];
    document.querySelectorAll('[data-pref="lang"]').forEach(b => { b.setAttribute('aria-label', w.lang); b.title = w.lang; });
    document.querySelectorAll('[data-pref="theme"]').forEach(b => { const t = w[root.dataset.theme]; b.setAttribute('aria-label', t); b.title = t; });
    document.querySelectorAll('[data-aria-en]').forEach(el => { if (!el.hasAttribute('data-aria-zh')) el.setAttribute('data-aria-zh', el.getAttribute('aria-label') || ''); el.setAttribute('aria-label', el.getAttribute(lang === 'en' ? 'data-aria-en' : 'data-aria-zh')); });
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
  let lastData=null, lastNotice=null;
  const say=(z,e)=>{lastNotice=[z,e];$('notice').textContent=t(z,e);};
  const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const svg=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,val] of Object.entries(attrs))el.setAttribute(name,val);return el;};
  const paint=(tag,parent,attrs,text)=>{const el=svg(tag,attrs);if(text!=null)el.textContent=text;parent.append(el);return el;};
  let days=30, serial=0, pending=null, last=null, lastTime=0, leaving=false;
  const offset=()=>-new Date().getTimezoneOffset();
  function time(ms,off){return new Date(ms+off*60000).toISOString().slice(0,19).replace('T',' ');}
  function table(title,heads,rows){const t=make('table'),caption=make('caption',title);caption.className='adm-sr';t.append(caption);const thr=t.createTHead().insertRow();for(const h of heads){const c=make('th',h);c.scope='col';thr.append(c);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const val of row){tr.insertCell().textContent=val;}}return t;}
  function chart(rows){const w=700,h=182,x0=42,x1=w-18,y0=16,y1=h-29;const root=svg('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':t('每日页面浏览量与每日访客数','Daily page views and daily visitors')});const top=Math.max(1,...rows.map(r=>r.views),...rows.map(r=>r.visitors));const x=i=>x0+(x1-x0)*i/Math.max(1,rows.length-1), y=n=>y1-(y1-y0)*n/top;
    for(const val of new Set([0,Math.round(top/2),top])){paint('line',root,{x1:x0,x2:x1,y1:y(val),y2:y(val),class:'adm-grid'});paint('text',root,{x:x0-7,y:y(val)+4,'text-anchor':'end'},num(val));}
    for(const [field,cl] of [['views','adm-line-pv'],['visitors','adm-line-uv']]){const d=rows.map((r,i)=>i?`H ${x(i).toFixed(1)} V ${y(r[field]).toFixed(1)}`:`M ${x0} ${y(r[field]).toFixed(1)}`).join(' ');paint('path',root,{d,class:cl,fill:'none','vector-effect':'non-scaling-stroke'});}
    if(rows.length){for(const i of new Set([0,Math.floor(rows.length/2),rows.length-1]))paint('text',root,{x:x(i),y:h-6,'text-anchor':i===0?'start':i===rows.length-1?'end':'middle'},rows[i].day.slice(5));}return root;
  }
  function heatMap(hours){const names=zh()?['周日','周一','周二','周三','周四','周五','周六']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const map=new Map(hours.map(r=>[r.weekday*24+r.hour,r.views])),max=Math.max(1,...hours.map(h=>h.views));const root=svg('svg',{viewBox:'0 0 678 143',role:'img','aria-label':t('按星期和小时统计的访问强度，颜色越深访问越多','Traffic intensity by weekday and hour; darker accent means more visits')});
    for(let h=0;h<24;h+=3)paint('text',root,{x:46+h*26,y:12},String(h).padStart(2,'0'));
    for(let j=0;j<7;j++){const day=(j+1)%7;paint('text',root,{x:0,y:31+j*16},names[day]);for(let h=0;h<24;h++){const n=map.get(day*24+h)||0;const cell=paint('rect',root,{x:46+h*26,y:21+j*16,width:23,height:12,rx:2,class:'adm-level-'+(n?Math.ceil(4*n/max):0)});paint('title',cell,{},`${names[day]} ${String(h).padStart(2,'0')}:00 · ${t(n+' 次浏览',n+' views')}`);}}return root;}
  function render(d){lastData=d;const tt=d.totals;for(const [id,value] of Object.entries({views:num(tt.views),visitorDays:num(tt.visitorDays),average:tt.visitorDays?(tt.views/tt.visitorDays).toFixed(1):'—',today:num(tt.todayViews)+' / '+num(tt.todayVisitors)}))$('v-'+id).textContent=value;
    const since=time(d.trackedSince,d.offset).slice(0,10);
    const delta=tt.previousViews===null?t('上一时段的数据不完整。','Prior window not fully tracked.'):t(`上一时段 ${num(tt.previousViews)} 次浏览。`,`${num(tt.previousViews)} views in prior window.`);
    $('coverage').textContent=t(`累计 ${num(d.lifetimeViews)} 次页面浏览。自 ${since} 起记录详细数据。${delta}访客天数是每日访客数之和，不是跨天去重后的人数。`,`${num(d.lifetimeViews)} all-time page views. Detailed tracking since ${since}. ${delta} Visitor-days sum daily visitors; not distinct people across days.`);
    $('wave').replaceChildren(chart(d.trend));$('daily-values').replaceChildren(table(t('每日合计','Daily totals'),t(['日期','浏览','访客'],['Date','Views','Visitors']),d.trend.map(r=>[r.day,num(r.views),num(r.visitors)])));
    $('heat').replaceChildren(heatMap(d.hours));
    for(const [k,list] of Object.entries(d.ranks)){const ol=$('rank-'+k);if(!ol)continue;const entries=list.map(r=>{const li=make('li');li.append(make('span',r.label),make('b',num(r.n)));return li;});ol.replaceChildren(...(entries.length?entries:[make('li',t('这个时间范围内没有访问。','No visits in this window.'))]));}
    $('event-log').replaceChildren(d.events.length?table(t('最近访问','Recent visits'),t(['时间','页面','来源','国家/地区','设备 / 浏览器 / 系统','今日首访'],['Time','Page','Source','Country','Device / browser / OS','First today']),d.events.map(e=>[time(e.at,d.offset),e.path,e.ref,e.country,[e.device,e.browser,e.os].join(' / '),e.first_visit?t('是','Yes'):'—'])):make('p',t('这个时间范围内没有访问记录。','No visits recorded in this window.')));
    $('report-data').hidden=false;const sign=d.offset<0?'−':'+';const minutes=Math.abs(d.offset);const zone=`UTC${sign}${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,at=time(d.updated,d.offset).slice(11);say(`${d.days} 天范围 · ${zone} · 更新于 ${at}`,`${d.days}-day window · ${zone} · Updated ${at}`);
    document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===d.days)));
  }
  function clearAndLogin(){leaving=true;last=null;pending?.abort();$('report-data').replaceChildren();$('report-data').hidden=true;say('会话已结束，正在返回登录页…','Session ended. Returning to sign-in…');location.replace('/admin');}
  async function load(){if(leaving)return;const id=++serial;pending?.abort();const ctl=new AbortController();pending=ctl;const timer=setTimeout(()=>ctl.abort(),15000);say('正在更新报表…','Updating report…');try{const r=await fetch(`/admin/api/report?days=${days}&offset=${offset()}`,{cache:'no-store',credentials:'same-origin',signal:ctl.signal});if(id!==serial)return;if(r.status===401||r.status===403){clearAndLogin();return;}if(!r.ok)throw Error('unavailable');const d=await r.json();if(id!==serial)return;if(!d.ok)throw Error('unavailable');render(d);last=d.days;lastTime=Date.now();}catch{if(id!==serial||leaving)return;days=last||days;if(last)say(`更新失败 · 仍显示上次成功加载的 ${last} 天报表。点“刷新”重试。`,`Update failed · still showing last successful ${last}-day report. Use Refresh to retry.`);else say('暂无报表，点“刷新”重试。','No report available. Use Refresh to retry.');}finally{clearTimeout(timer);if(id===serial)pending=null;}}
  document.addEventListener('npa:lang',()=>{if(lastData&&!leaving)render(lastData);else if(lastNotice)$('notice').textContent=t(...lastNotice);});
  document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{days=+b.dataset.days;load();}));$('refresh').addEventListener('click',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!pending&&Date.now()-lastTime>60000)load();});window.addEventListener('pageshow',e=>{if(e.persisted){$('report-data').hidden=true;load();}});window.addEventListener('pagehide',()=>{$('report-data').hidden=true;});setInterval(()=>{if(!document.hidden&&!pending)load();},60000);load();
}
