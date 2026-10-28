// ============================================================
// Link-Page Builder + Posts - Cloudflare Pages (_worker.js) / Workers + D1
// Home = customisable link page | /posts = post feed | /admin = builder
// Site ON/OFF switch, 18+ gate, Terms/Privacy pages, analytics
// Bindings: D1 -> DB | Secrets: ADMIN_PASSWORD, SESSION_SECRET
// ============================================================

const enc = new TextEncoder();
let ready = false;
let cache = { t: 0, v: null };

const IST = 19800000;
const dayStr = (off = 0) => new Date(Date.now() + IST - off * 864e5).toISOString().slice(0, 10);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (b, status = 200, h = {}) => new Response(b, { status, headers: { 'Content-Type': 'text/html;charset=utf-8', ...h } });
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...h } });
const okUrl = (u) => !u || /^https?:\/\/[^\s]+$/i.test(u);
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const redirect = (to) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });

// ---------- defaults + sanitiser ----------
const DP = {
  site: 'My Page', title: 'My Page', bio: 'Welcome! Tap a link below.', avatar: '',
  bg: { type: 'gradient', c1: '#1e1b4b', c2: '#6c5ce7', angle: 160, img: '', pos: 'center', blur: 0, ovt: 'solid', oc1: '#000000', oc2: '#000000', oang: 180, ov: 0.35 },
  tx: '#ffffff', font: 'sans',
  btn: { style: 'grad', c1: '#6c5ce7', c2: '#ec4899', tc: '#ffffff', r: 16, size: 'm', align: 'center', w: 'full', anim: true },
  age: { on: true, title: '18+ Website Alert', text: 'This page is only for people aged 18 or older. Are you 18+?', yes: 'Yes, I am 18+', no: 'No' },
  posts: { btn: true, label: 'Posts', latest: false, count: 6, title: 'Latest posts' },
  seo: { title: '', desc: '', img: '', icon: '' },
  off: { on: false, title: 'We will be back soon', text: 'This website is temporarily closed. Please check back later.' },
  contact: '', links: [],
};
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const SC_FROM = '\u1d00\u0299\u1d04\u1d05\u1d07\ua730\u0262\u029c\u026a\u1d0a\u1d0b\u029f\u1d0d\u0274\u1d0f\u1d18\u01eb\u0280\ua731\u1d1b\u1d1c\u1d20\u1d21\u028f\u1d22';
const SC_TO = 'ABCDEFGHIJKLMNOPQRSTUVWYZ';
const norm = (s) => [...s].map((ch) => { const i = SC_FROM.indexOf(ch); return i < 0 ? ch : SC_TO[i]; }).join('');
const str = (v, n, d = '') => (typeof v === 'string' ? norm(v.trim().slice(0, n)) : d);
const num = (v, a, b, d) => { v = parseFloat(v); return isNaN(v) ? d : Math.min(Math.max(v, a), b); };
const url = (v) => { v = str(v, 500); return okUrl(v) ? v : ''; };
const one = (v, arr, d) => (arr.includes(v) ? v : d);
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const merge = (d, c) => { const o = { ...d }; for (const k in c) o[k] = isObj(c[k]) && isObj(d[k]) ? merge(d[k], c[k]) : c[k]; return o; };

function clean(c) {
  c = c || {};
  const b = c.bg || {}, k = c.btn || {}, a = c.age || {}, p = c.posts || {}, s = c.seo || {}, o = c.off || {};
  return {
    site: str(c.site, 60, DP.site) || DP.site, title: str(c.title, 80, DP.title), bio: str(c.bio, 300), avatar: url(c.avatar),
    bg: {
      type: one(b.type, ['color', 'gradient', 'image'], 'gradient'), c1: col(b.c1, DP.bg.c1), c2: col(b.c2, DP.bg.c2), angle: num(b.angle, 0, 360, 160),
      img: url(b.img), pos: one(b.pos, ['center', 'top', 'bottom', 'left', 'right'], 'center'), blur: num(b.blur, 0, 20, 0),
      ovt: one(b.ovt, ['none', 'solid', 'gradient'], 'solid'), oc1: col(b.oc1, '#000000'), oc2: col(b.oc2, '#000000'), oang: num(b.oang, 0, 360, 180), ov: num(b.ov, 0, 1, 0.35),
    },
    tx: col(c.tx, '#ffffff'), font: one(c.font, ['sans', 'serif', 'mono', 'round'], 'sans'),
    btn: {
      style: one(k.style, ['fill', 'outline', 'glass', 'grad'], 'grad'), c1: col(k.c1, DP.btn.c1), c2: col(k.c2, DP.btn.c2), tc: col(k.tc, '#ffffff'), r: num(k.r, 0, 40, 16),
      size: one(k.size, ['s', 'm', 'l'], 'm'), align: one(k.align, ['left', 'center', 'right'], 'center'), w: one(k.w, ['full', 'narrow'], 'full'), anim: k.anim !== false,
    },
    age: { on: !!a.on, title: str(a.title, 80, DP.age.title), text: str(a.text, 300, DP.age.text), yes: str(a.yes, 30, DP.age.yes), no: str(a.no, 30, DP.age.no) },
    posts: { btn: p.btn !== false, label: str(p.label, 30, 'Posts') || 'Posts', latest: !!p.latest, count: Math.round(num(p.count, 1, 12, 6)), title: str(p.title, 40, 'Latest posts') },
    seo: { title: str(s.title, 80), desc: str(s.desc, 200), img: url(s.img), icon: url(s.icon) },
    off: { on: !!o.on, title: str(o.title, 80, DP.off.title), text: str(o.text, 300, DP.off.text) },
    contact: str(c.contact, 100),
    links: (Array.isArray(c.links) ? c.links : []).slice(0, 60)
      .map((l) => ({ id: /^[a-z0-9]{4,12}$/i.test(l.id || '') ? l.id : rid(), label: str(l.label, 80, 'Link') || 'Link', url: url(l.url), icon: url(l.icon), pr: !!l.pr, on: l.on !== false }))
      .filter((l) => l.url),
  };
}

async function init(env) {
  if (ready) return;
  const d = env.DB;
  await d.batch([
    d.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    d.prepare('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, thumb TEXT, link TEXT, duration TEXT, views INTEGER DEFAULT 0, created_at INTEGER, pinned INTEGER DEFAULT 0)'),
    d.prepare('CREATE TABLE IF NOT EXISTS post_views (post_id INTEGER, day TEXT, vid TEXT, PRIMARY KEY (post_id, day, vid))'),
    d.prepare('CREATE TABLE IF NOT EXISTS visits (day TEXT, vid TEXT, src TEXT, country TEXT, city TEXT, device TEXT, hits INTEGER DEFAULT 1, ts INTEGER, PRIMARY KEY (day, vid))'),
    d.prepare('CREATE TABLE IF NOT EXISTS lclicks (day TEXT, lid TEXT, c INTEGER DEFAULT 0, PRIMARY KEY (day, lid))'),
    d.prepare('CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day)'),
  ]);
  try { await d.prepare('ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0').run(); } catch (e) {}
  ready = true;
}

async function getPage(env, fresh) {
  if (!fresh && cache.v && Date.now() - cache.t < 15000) return cache.v;
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k='page'").first();
  let c = {};
  try { c = r ? JSON.parse(r.v) : {}; } catch (e) {}
  const v = clean(merge(DP, c));
  cache = { t: Date.now(), v };
  return v;
}
async function savePage(env, c) {
  await env.DB.prepare("INSERT INTO settings (k,v) VALUES ('page',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(c)).run();
  cache = { t: Date.now(), v: c };
}

// ---------- auth ----------
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function makeToken(env) { const exp = Date.now() + 7 * 864e5; return exp + '.' + (await hmac(env.SESSION_SECRET, String(exp))); }
async function isAdmin(req, env) {
  const m = (req.headers.get('Cookie') || '').match(/adm=([^;]+)/);
  if (!m || !env.SESSION_SECRET) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Date.now() > +exp) return false;
  return sig === (await hmac(env.SESSION_SECRET, exp));
}

// ---------- analytics ----------
const isBot = (ua) => !ua || /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|headless|lighthouse|embedly|discord|bingpreview/i.test(ua);
const vidOf = async (req, env) => (await hmac(env.SESSION_SECRET || 'x', (req.headers.get('CF-Connecting-IP') || '') + '|' + (req.headers.get('User-Agent') || ''))).slice(0, 20);

function srcOf(req, u) {
  const p = (u.searchParams.get('src') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  if (p) return p;
  const ua = req.headers.get('User-Agent') || '';
  let h = '';
  try { h = new URL(req.headers.get('Referer') || '').hostname.toLowerCase(); } catch (e) {}
  if (h === u.hostname) h = '';
  if (/instagram\.com$/.test(h) || /Instagram/i.test(ua)) return 'instagram';
  if (/(^|\.)t\.me$/.test(h) || /telegram/.test(h)) return 'telegram';
  if (/facebook|fb\.com|fb\.me/.test(h) || /FBAN|FBAV/.test(ua)) return 'facebook';
  if (/youtube|youtu\.be/.test(h)) return 'youtube';
  if (/google\./.test(h)) return 'google';
  if (/(^|\.)x\.com$|twitter|(^|\.)t\.co$/.test(h)) return 'twitter';
  if (/whatsapp/.test(h)) return 'whatsapp';
  if (h) return h.replace(/^www\./, '').slice(0, 30);
  return 'direct';
}

async function trackVisit(req, env, u) {
  const ua = req.headers.get('User-Agent') || '';
  if (isBot(ua)) return;
  const cf = req.cf || {};
  await env.DB.prepare('INSERT INTO visits (day,vid,src,country,city,device,hits,ts) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(day,vid) DO UPDATE SET hits=hits+1, ts=excluded.ts')
    .bind(dayStr(), await vidOf(req, env), srcOf(req, u), cf.country || '??', String(cf.city || '').slice(0, 40), /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop', Date.now()).run();
}
async function countPostView(env, id, vid) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO post_views (post_id,day,vid) VALUES (?,?,?)').bind(id, dayStr(), vid).run();
  if (r.meta && r.meta.changes) await env.DB.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(id).run();
}

async function stats(env, days) {
  days = Math.min(Math.max(days || 7, 1), 90);
  const from = dayStr(days - 1), d = env.DB;
  const [daily, srcs, ctry, dev, lk, tot, act, tops, clk] = await d.batch([
    d.prepare('SELECT day, COUNT(*) v, SUM(hits) h FROM visits WHERE day>=? GROUP BY day').bind(from),
    d.prepare('SELECT src k, COUNT(*) c FROM visits WHERE day>=? GROUP BY src ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare('SELECT country k, COUNT(*) c FROM visits WHERE day>=? GROUP BY country ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare('SELECT device k, COUNT(*) c FROM visits WHERE day>=? GROUP BY device ORDER BY c DESC').bind(from),
    d.prepare('SELECT lid k, SUM(c) c FROM lclicks WHERE day>=? GROUP BY lid ORDER BY c DESC LIMIT 20').bind(from),
    d.prepare('SELECT COUNT(DISTINCT vid) u, COALESCE(SUM(hits),0) h FROM visits WHERE day>=?').bind(from),
    d.prepare('SELECT COUNT(*) a FROM visits WHERE ts>?').bind(Date.now() - 30 * 60 * 1000),
    d.prepare('SELECT p.id, p.title, COUNT(*) c FROM post_views v JOIN posts p ON p.id=v.post_id WHERE v.day>=? GROUP BY p.id ORDER BY c DESC LIMIT 5').bind(from),
    d.prepare('SELECT COUNT(*) c FROM post_views WHERE day>=?').bind(from),
  ]);
  const map = {};
  daily.results.forEach((r) => (map[r.day] = r));
  const filled = [];
  for (let i = days - 1; i >= 0; i--) { const k = dayStr(i), r = map[k]; filled.push({ day: k, v: r ? r.v : 0, h: r ? r.h : 0 }); }
  return {
    daily: filled, today: filled[filled.length - 1], sources: srcs.results, countries: ctry.results, devices: dev.results, links: lk.results,
    range: tot.results[0], active: act.results[0].a, tops: tops.results, clicks: clk.results[0].c,
  };
}

// ---------- CSS ----------
const BASE = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1115;color:#eef1f6;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.45;-webkit-tap-highlight-color:transparent}
a{color:inherit;text-decoration:none}
.btn{display:inline-block;background:linear-gradient(135deg,#6c5ce7,#4f46e5);color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;text-align:center}
.btn.g{background:#232a35;color:#eef1f6}.btn.r{background:#e5484d}.btn.ok{background:#16a34a}.btn.full{display:block;width:100%}.btn.sm{padding:8px 14px;font-size:14px}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px;z-index:99}
.pp{background:#1a1f27;color:#eef1f6;border-radius:22px;max-width:380px;width:100%;padding:24px;text-align:center}
.pp h3{font-size:20px;margin:10px 0 8px}.pp p{color:#aab2c0;font-size:14px;margin-bottom:18px}
.w18{width:70px;height:70px;border-radius:50%;background:#e5484d;color:#fff;font-weight:800;font-size:24px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.pg{position:relative;min-height:100vh;display:flex;justify-content:center;overflow:hidden}
.pg .bgi{position:absolute;inset:-24px;background-size:cover}
.pg .ovl{position:absolute;inset:0}
.pg .in{position:relative;width:100%;max-width:520px;padding:44px 18px 40px;text-align:center}
.pg .in.wide{max-width:1000px}
.av{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.6);margin-bottom:14px}
.pg h1{font-size:24px;margin-bottom:6px}
.bio{opacity:.9;margin-bottom:22px;font-size:15px;white-space:pre-line}
.lk{--is:40px;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;margin:0 0 12px;border-radius:var(--br);font-weight:600;position:relative;overflow:hidden;transition:transform .15s;font-size:15px}
.lk:active{transform:scale(.98)}
.lk span{flex:1;text-align:center;padding:0 12px;word-break:break-word}
.lk.hi span{padding-left:calc(var(--is) + 22px);padding-right:calc(var(--is) + 22px)}
.lk img{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:var(--is);height:var(--is);border-radius:calc(var(--br) * .6);object-fit:cover}
.sz-s .lk{--is:30px;min-height:44px;font-size:13px;padding:6px 12px}
.sz-l .lk{--is:54px;min-height:72px;font-size:18px;padding:10px 18px}
.al-left .lk span{text-align:left}.al-right .lk span{text-align:right}.al-center .lk span{text-align:center}
.al-left .lk.hi span{padding-right:12px}.al-right .lk.hi span{padding-right:12px}
.w-narrow .lk{width:78%;margin-left:auto;margin-right:auto}
.an .lk:hover{transform:translateY(-3px) scale(1.02)}
.bs-fill .lk{background:var(--b1);color:var(--bt)}
.bs-outline .lk{border:2px solid var(--b1);color:var(--b1);background:transparent}
.bs-glass .lk{background:rgba(255,255,255,.18);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);color:var(--bt)}
.bs-grad .lk{background:linear-gradient(135deg,var(--b1),var(--b2));color:var(--bt)}
.lk.pr{background:linear-gradient(120deg,var(--b1),var(--b2),var(--b1));background-size:200% 100%;color:var(--bt);border:0;animation:mv 3s linear infinite;box-shadow:0 0 18px color-mix(in srgb,var(--b1) 60%,transparent)}
.lk.pr::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:shn 2.4s infinite}
@keyframes mv{to{background-position:-200% 0}}
@keyframes shn{to{left:130%}}
.sh{font-size:17px;margin:22px 0 12px}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;text-align:left}
.pc{display:block;background:rgba(255,255,255,.14);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.22);border-radius:min(var(--br),24px);overflow:hidden;color:inherit;transition:transform .15s}
.pc:hover{transform:translateY(-3px)}
.pt{position:relative;aspect-ratio:16/10;background:rgba(0,0,0,.25)}
.pt img{width:100%;height:100%;object-fit:cover;display:block}
.dur{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.78);color:#fff;padding:2px 7px;border-radius:7px;font-size:12px}
.pin{position:absolute;left:8px;top:8px;font-size:14px}
.pm{padding:10px 12px 12px}
.pm b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;line-height:1.3;min-height:36px}
.pm small{display:block;margin-top:6px;opacity:.75;font-size:12px}
.phd{display:flex;align-items:center;gap:14px;text-align:left}
.back{font-size:14px;opacity:.85;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.14)}
.sq{width:100%;padding:11px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.14);color:inherit;font-size:15px;margin:14px 0;outline:none}
.empty{grid-column:1/-1;text-align:center;opacity:.7;padding:40px 0}
.ft{margin-top:26px;font-size:12px;opacity:.75}
.doc{max-width:760px;margin:0 auto;padding:30px 18px 60px}
.doc h1{font-size:28px;margin-bottom:6px}.doc h2{font-size:18px;margin:24px 0 8px}
.doc p,.doc li{color:#c8cfdb;font-size:15px;margin-bottom:8px}.doc ul{padding-left:20px}.doc .mu{color:#8b94a3;font-size:13px}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:#1a1f27;border:1px solid #262c36;border-radius:16px;padding:16px;margin-bottom:16px}
.box h2{font-size:17px;margin-bottom:10px}
.mu{color:#8b94a3}
.fm label{display:block;font-size:13px;color:#8b94a3;margin:10px 0 4px}
.fm label.ck{display:flex;color:#c8cfdb;font-size:14px}
.fm input:not([type=checkbox]):not([type=range]),.fm select,.fm textarea{width:100%;background:#0f1115;border:1px solid #262c36;border-radius:10px;padding:11px;color:#eef1f6;font-size:15px;outline:none;font-family:inherit}
.fm input[type=color]{height:44px;padding:3px}
.fm input[type=range]{width:100%}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.hd{position:sticky;top:0;z-index:20;background:rgba(15,17,21,.92);backdrop-filter:blur(10px);border-bottom:1px solid #262c36;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px}
.hr{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.offbar{background:#e5484d;color:#fff;text-align:center;padding:8px;font-size:14px;font-weight:600}
.tabs{display:flex;gap:8px;overflow-x:auto;padding:14px;max-width:1100px;margin:0 auto}
.tabs button,.rg button{flex:none;background:#1a1f27;border:1px solid #262c36;color:#eef1f6;padding:9px 16px;border-radius:999px;cursor:pointer;font-size:14px}
.tabs button.on,.rg button.on{background:#6c5ce7;border-color:#6c5ce7}
.lay{max-width:1100px;margin:0 auto;padding:0 14px 60px}
.tp{display:none}.tp.on{display:block}
.phone{width:100%;max-width:380px;height:600px;overflow:auto;border-radius:30px;border:6px solid #2a313c;margin:0 auto}
.phone .pg{min-height:100%}
@media(min-width:900px){.lay{display:grid;grid-template-columns:1fr 400px;gap:20px}#t_pv{display:block!important;position:sticky;top:70px;align-self:start}.tpv{display:none}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.stats{grid-template-columns:repeat(4,1fr)!important}}
.row{display:flex;gap:10px;align-items:flex-start;background:#0f1115;border:1px solid #262c36;border-radius:12px;padding:10px;margin-bottom:10px}
.row.drg{opacity:.6;border-color:#6c5ce7}
.hdl{touch-action:none;cursor:grab;color:#8b94a3;font-size:20px;padding:6px 4px;user-select:none}
.row .f{flex:1;min-width:0}
.row input:not([type=checkbox]){width:100%;background:#1a1f27;border:1px solid #262c36;border-radius:8px;padding:9px;color:#eef1f6;font-size:14px;margin-bottom:6px;outline:none}
.ro{display:flex;gap:14px;flex-wrap:wrap}
.ck{font-size:13px;color:#aab2c0;display:flex;gap:6px;align-items:center}
.rb{display:flex;flex-direction:column;gap:6px}
.x2{background:#232a35;color:#eef1f6;border:0;border-radius:8px;width:34px;height:34px;cursor:pointer}
.x2.d{background:#2a1215;color:#ff6b6b}
.pi{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #262c36}
.pi img,.pi .nt{width:56px;height:56px;border-radius:10px;object-fit:cover;background:#0f1115;flex:none}
.pi .in2{flex:1;min-width:0;font-size:14px}
.pi .in2 b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ths{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.thb{height:62px;border-radius:12px;border:2px solid #262c36;cursor:pointer;font-weight:600;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px}
.st{background:#1a1f27;border:1px solid #262c36;border-radius:14px;padding:14px}
.st b{display:block;font-size:26px}.st span{color:#8b94a3;font-size:13px}
.bars{display:flex;align-items:flex-end;gap:3px;height:150px;margin-top:10px}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.bar i{display:block;width:100%;background:#6c5ce7;border-radius:4px 4px 0 0;min-height:2px}
.bar small{font-size:9px;color:#8b94a3;margin-top:3px;height:12px}
.li{margin-bottom:10px}.lt{display:flex;justify-content:space-between;font-size:14px;gap:8px}.lt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb{height:6px;background:#0f1115;border-radius:6px;margin-top:4px;overflow:hidden}.lb i{display:block;height:100%;background:#6c5ce7;border-radius:6px}
code{background:#0f1115;padding:2px 6px;border-radius:6px;font-size:13px;word-break:break-all}
`;

const shell = (title, head, body, script) =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' + (head || '') + '<style>' + BASE + '</style></head><body>' + body + (script ? '<script>' + script + '</script>' : '') + '</body></html>';

// ---------- client scripts (String.raw: no backticks, no dollar-brace) ----------
const RENDER_JS = String.raw`
var FONTS={sans:'Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'ui-monospace,Menlo,Consolas,monospace',round:'"Trebuchet MS","Segoe UI",system-ui,sans-serif'};
function E(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){n=n||0;return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function ago(t){var s=(Date.now()-t)/1000;if(!t||s<0)return '';if(s<3600)return Math.max(1,Math.floor(s/60))+' min ago';if(s<86400)return Math.floor(s/3600)+' h ago';if(s<2592000)return Math.floor(s/86400)+' d ago';return Math.floor(s/2592000)+' mo ago';}
function PC(p){return '<a class="pc" href="/p/'+p.id+'" target="_blank" rel="noopener"><div class="pt">'+(p.thumb?'<img loading="lazy" decoding="async" src="'+E(p.thumb)+'" alt="">':'')+(p.duration?'<span class="dur">'+E(p.duration)+'</span>':'')+(p.pinned?'<span class="pin">&#128204;</span>':'')+'</div><div class="pm"><b>'+E(p.title)+'</b><small>&#128065; '+fmt(p.views)+' &middot; '+ago(p.created_at)+'</small></div></a>';}
function S(c,root){
 var b=c.bg,s=root.style,k=c.btn;
 s.backgroundImage='';
 if(b.type==='gradient')s.background='linear-gradient('+b.angle+'deg,'+b.c1+','+b.c2+')';else s.background=b.c1;
 s.setProperty('--b1',k.c1);s.setProperty('--b2',k.c2);s.setProperty('--bt',k.tc);s.setProperty('--br',k.r+'px');
 s.fontFamily=FONTS[c.font]||FONTS.sans;s.color=c.tx;
 root.className='pg bs-'+k.style+' sz-'+k.size+' al-'+k.align+' w-'+k.w+(k.anim?' an':'');
 root.innerHTML='';
 if(b.type==='image'&&b.img){
  var d=document.createElement('div');d.className='bgi';d.style.backgroundImage='url("'+b.img.replace(/"/g,'%22')+'")';d.style.backgroundPosition=b.pos;d.style.filter='blur('+b.blur+'px)';root.appendChild(d);
  if(b.ovt!=='none'){var o=document.createElement('div');o.className='ovl';o.style.background=b.ovt==='solid'?b.oc1:'linear-gradient('+b.oang+'deg,'+b.oc1+','+b.oc2+')';o.style.opacity=b.ov;root.appendChild(o);}
 }
}
function R(c,root,pv){
 S(c,root);
 var h='';
 if(c.avatar)h+='<img class="av" src="'+E(c.avatar)+'" alt="">';
 h+='<h1>'+E(c.title)+'</h1>'+(c.bio?'<p class="bio">'+E(c.bio)+'</p>':'');
 c.links.forEach(function(l){if(l.on===false)return;h+='<a class="lk'+(l.pr?' pr':'')+(l.icon?' hi':'')+'" href="'+(pv?'#':'/l/'+l.id)+'">'+(l.icon?'<img src="'+E(l.icon)+'" alt="" loading="lazy">':'')+'<span>'+E(l.label)+'</span></a>';});
 if(c.posts.btn)h+='<a class="lk" href="'+(pv?'#':'/posts')+'"><span>'+E(c.posts.label)+'</span></a>';
 if(c.latest&&c.latest.length)h+='<h2 class="sh">'+E(c.posts.title)+'</h2><div class="pgrid">'+c.latest.map(PC).join('')+'</div>';
 h+='<div class="ft"><a href="'+(pv?'#':'/terms')+'">Terms &amp; Conditions</a> &middot; <a href="'+(pv?'#':'/privacy')+'">Privacy Policy</a></div>';
 var w=document.createElement('div');w.className='in';w.innerHTML=h;root.appendChild(w);
}
function AG(c){
 if(!c.age.on)return;
 var ok=false;try{ok=localStorage.getItem('a18')==='1'}catch(e){}
 if(ok)return;
 var o=document.createElement('div');o.className='ov';
 o.innerHTML='<div class="pp"><div class="w18">18+</div><h3>'+E(c.age.title)+'</h3><p>'+E(c.age.text)+'</p><button class="btn full" id="ay">'+E(c.age.yes)+'</button><button class="btn g full" id="an" style="margin-top:10px">'+E(c.age.no)+'</button></div>';
 document.body.appendChild(o);
 document.getElementById('ay').onclick=function(){try{localStorage.setItem('a18','1')}catch(e){}o.remove();};
 document.getElementById('an').onclick=function(){location.href='https://www.google.com';};
}
`;

const HOME_JS = String.raw`
var c=window.CFG;R(c,document.getElementById('pg'),false);AG(c);
`;

const POSTS_JS = String.raw`
var c=window.CFG,root=document.getElementById('pg');
S(c,root);
var w=document.createElement('div');w.className='in wide';
w.innerHTML='<div class="phd"><a class="back" href="/">&larr; Home</a><h1>Posts</h1></div><input id="q" class="sq" type="search" placeholder="Search posts..."><div id="plist" class="pgrid"></div><div id="pend" style="height:1px"></div><div class="ft"><a href="/terms">Terms &amp; Conditions</a> &middot; <a href="/privacy">Privacy Policy</a></div>';
root.appendChild(w);
var page=1,busy=false,more=true,q='',list=document.getElementById('plist');
async function load(reset){
 if(busy)return;if(reset){page=1;more=true;}if(!more)return;busy=true;
 try{
  var r=await fetch('/api/posts?page='+page+'&q='+encodeURIComponent(q));var d=await r.json();
  if(reset)list.innerHTML='';
  list.insertAdjacentHTML('beforeend',d.posts.map(PC).join(''));
  more=d.more;page++;
  if(!d.posts.length&&reset)list.innerHTML='<div class="empty">No posts found</div>';
 }catch(e){}
 busy=false;
}
new IntersectionObserver(function(e){if(e[0].isIntersecting)load(false);},{rootMargin:'600px'}).observe(document.getElementById('pend'));
var tm;document.getElementById('q').addEventListener('input',function(e){clearTimeout(tm);tm=setTimeout(function(){q=e.target.value.trim();load(true);},350);});
load(true);AG(c);
`;

const OFF_JS = String.raw`
var c=window.CFG,root=document.getElementById('pg');S(c,root);
var w=document.createElement('div');w.className='in';w.style.paddingTop='20vh';
w.innerHTML='<div style="font-size:54px;margin-bottom:10px">&#128274;</div><h1>'+E(c.off.title)+'</h1><p class="bio">'+E(c.off.text)+'</p>';
root.appendChild(w);
`;

const ADMIN_JS = String.raw`
function $(i){return document.getElementById(i)}
var cfg=null,days=7,drag=null,posts=[];
var NAMES={instagram:'Instagram',telegram:'Telegram',facebook:'Facebook',youtube:'YouTube',google:'Google',twitter:'X / Twitter',whatsapp:'WhatsApp',direct:'Direct / Unknown'};
var TH=[
 {n:'Midnight',bg:{type:'gradient',c1:'#0f172a',c2:'#4f46e5',angle:160},tx:'#ffffff',btn:{style:'grad',c1:'#6366f1',c2:'#ec4899',tc:'#ffffff'}},
 {n:'Sunset',bg:{type:'gradient',c1:'#ff7e5f',c2:'#6a11cb',angle:150},tx:'#ffffff',btn:{style:'glass',c1:'#ffffff',c2:'#ffd1a8',tc:'#ffffff'}},
 {n:'Ocean',bg:{type:'gradient',c1:'#0ea5e9',c2:'#0f172a',angle:180},tx:'#ffffff',btn:{style:'fill',c1:'#ffffff',c2:'#bae6fd',tc:'#0f172a'}},
 {n:'Forest',bg:{type:'gradient',c1:'#064e3b',c2:'#10b981',angle:160},tx:'#ffffff',btn:{style:'outline',c1:'#ffffff',c2:'#a7f3d0',tc:'#ffffff'}},
 {n:'Light',bg:{type:'color',c1:'#f4f6fb',c2:'#ffffff',angle:0},tx:'#151a23',btn:{style:'fill',c1:'#151a23',c2:'#6c5ce7',tc:'#ffffff'}},
 {n:'Neon',bg:{type:'color',c1:'#0a0a0f',c2:'#000000',angle:0},tx:'#f0f0ff',btn:{style:'grad',c1:'#00f5a0',c2:'#00d9f5',tc:'#04110c'}}
];
function show(ok){$('login').style.display=ok?'none':'flex';$('app').style.display=ok?'block':'none';}
async function api(u,m,b){
 var r=await fetch(u,{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
 if(r.status===401){show(false);throw new Error('auth');}
 return r.json();
}
async function login(){
 var r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('pw').value})});
 if(r.ok){$('pw').value='';$('msg').textContent='';start();}else{$('msg').textContent='Wrong password';}
}
function tab(n){
 ['links','posts','design','set','stats','pv'].forEach(function(t){$('t_'+t).classList.toggle('on',t===n);});
 var bs=document.querySelectorAll('.tabs button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].dataset.t===n);
 if(n==='stats')loadStats();
 if(n==='posts')loadPosts();
}
function draw(){R(cfg,$('pv'),true);}
function setSw(){
 var off=cfg.off.on;
 $('sw').textContent=off?'Site: OFF':'Site: ON';
 $('sw').className='btn sm '+(off?'r':'ok');
 $('offbar').style.display=off?'block':'none';
}
function L(id){return cfg.links.filter(function(x){return x.id===id})[0];}
function newId(){return Math.random().toString(36).slice(2,10);}
function buildLinks(){
 $('lks').innerHTML=cfg.links.map(function(l){
  return '<div class="row" data-id="'+l.id+'"><span class="hdl">&#8942;&#8942;</span><div class="f"><input class="fl" placeholder="Button text" value="'+E(l.label)+'"><input class="fu" placeholder="Link (https://t.me/...)" value="'+E(l.url)+'"><input class="fi" placeholder="Icon / image URL (optional)" value="'+E(l.icon)+'"><div class="ro"><label class="ck"><input type="checkbox" class="fv"'+(l.on!==false?' checked':'')+'> Visible</label><label class="ck"><input type="checkbox" class="fp"'+(l.pr?' checked':'')+'> Premium shine</label></div></div><div class="rb"><button class="x2" data-dup="1" title="Duplicate">&#10064;</button><button class="x2 d" data-del="1" title="Delete">&#10005;</button></div></div>';
 }).join('')||'<p class="mu">No links yet. Use the button below to add one.</p>';
}
function getp(o,p){return p.split('.').reduce(function(a,k){return a[k]},o);}
function setp(o,p,v){var a=p.split('.'),l=a.pop();a.reduce(function(x,k){return x[k]},o)[l]=v;}
function bind(){
 document.querySelectorAll('[data-p]').forEach(function(e){
  var v=getp(cfg,e.dataset.p);
  if(e.type==='checkbox')e.checked=!!v;else e.value=v;
  e.oninput=e.onchange=function(){
   var nv=e.type==='checkbox'?e.checked:(e.type==='range'?parseFloat(e.value):e.value);
   setp(cfg,e.dataset.p,nv);draw();if(e.dataset.p==='off.on')setSw();
  };
 });
 setSw();
}
function applyTh(i){var t=TH[i];Object.assign(cfg.bg,t.bg);cfg.tx=t.tx;Object.assign(cfg.btn,t.btn);bind();draw();}
async function save(){
 var r=await api('/api/admin/page','POST',cfg);
 if(r.error){alert(r.error);return;}
 cfg=r.page;buildLinks();bind();draw();
 $('sbtn').textContent='Saved \u2713';setTimeout(function(){$('sbtn').textContent='Save';},1500);
}
async function toggleSite(){
 var want=!cfg.off.on;
 if(want&&!confirm('Close the website for all visitors? (You can still open it while logged in.)'))return;
 var r=await api('/api/admin/site','POST',{off:want});
 cfg.off.on=!!r.off;setSw();
}
// posts
async function loadPosts(){
 var d=await api('/api/admin/posts');posts=d.posts;
 $('pcnt').textContent='('+posts.length+')';
 $('plist').innerHTML=posts.map(function(p){
  return '<div class="pi" data-id="'+p.id+'">'+(p.thumb?'<img src="'+E(p.thumb)+'" alt="">':'<div class="nt"></div>')+'<div class="in2"><b>'+(p.pinned?'&#128204; ':'')+'#'+p.id+' '+E(p.title)+'</b><span class="mu">&#128065; '+p.views+(p.duration?' &middot; '+E(p.duration):'')+'</span></div><button class="x2" data-pin="1" title="Pin / unpin">&#128204;</button><button class="x2" data-edit="1" title="Edit">&#9998;</button><button class="x2 d" data-pdel="1" title="Delete">&#10005;</button></div>';
 }).join('')||'<p class="mu">No posts yet.</p>';
}
function P(id){return posts.filter(function(x){return x.id===id})[0];}
function clearf(){['f_id','f_title','f_thumb','f_link','f_dur'].forEach(function(i){$(i).value='';});$('f_pin').checked=false;$('formh').textContent='New post';}
async function savePost(){
 var b={title:$('f_title').value,thumb:$('f_thumb').value,link:$('f_link').value,duration:$('f_dur').value,pinned:$('f_pin').checked?1:0};
 var id=$('f_id').value;
 var r=id?await api('/api/admin/posts/'+id,'PUT',b):await api('/api/admin/posts','POST',b);
 if(r.error){alert(r.error);return;}
 clearf();loadPosts();
}
// stats
function stat(v,l){return '<div class="st"><b>'+v+'</b><span>'+l+'</span></div>';}
function cname(c){if(c==='??')return 'Unknown';try{return new Intl.DisplayNames(['en'],{type:'region'}).of(c)}catch(e){return c}}
function lst(a,f){
 var mx=1;a.forEach(function(x){if(x.c>mx)mx=x.c});
 return a.length?a.map(function(x){return '<div class="li"><div class="lt"><span>'+f(x.k)+'</span><b>'+x.c+'</b></div><div class="lb"><i style="width:'+Math.round(x.c/mx*100)+'%"></i></div></div>';}).join(''):'<p class="mu">No data yet</p>';
}
function chart(a){
 var mx=1;a.forEach(function(x){if(x.v>mx)mx=x.v});var lab=a.length<=14;
 return '<div class="bars">'+a.map(function(x){return '<div class="bar" title="'+x.day+': '+x.v+' visitors"><i style="height:'+Math.round(x.v/mx*100)+'%"></i><small>'+(lab?x.day.slice(8):'')+'</small></div>';}).join('')+'</div>';
}
async function loadStats(d){
 if(d)days=d;
 var bs=$('rg').querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',+bs[i].dataset.d===days);
 var s=await api('/api/admin/stats?days='+days);
 var names={};cfg.links.forEach(function(l){names[l.id]=l.label;});
 var h='<div class="stats">'+stat(s.today.v,'Visitors today')+stat(s.active,'Active now (30 min)')+stat(s.range.u,'Unique visitors ('+days+' d)')+stat(s.range.h,'Page views ('+days+' d)')+'</div>';
 h+='<div class="stats">'+stat(s.clicks,'Post clicks ('+days+' d)')+'</div>';
 h+='<div class="box"><h2>Daily visitors</h2>'+chart(s.daily)+'</div>';
 h+='<div class="two"><div class="box"><h2>Traffic sources</h2>'+lst(s.sources,function(k){return E(NAMES[k]||k);})+'</div><div class="box"><h2>Link clicks</h2>'+lst(s.links,function(k){return E(names[k]||'(deleted link)');})+'</div></div>';
 h+='<div class="two"><div class="box"><h2>Top posts</h2>'+lst(s.tops.map(function(x){return {k:'#'+x.id+' '+x.title,c:x.c};}),E)+'</div><div class="box"><h2>Country</h2>'+lst(s.countries,function(k){return E(cname(k));})+'</div></div>';
 h+='<div class="box"><h2>Device</h2>'+lst(s.devices,function(k){return k==='mobile'?'Mobile':'Desktop';})+'</div>';
 h+='<p class="mu" style="font-size:12px">A visitor = one device/browser (bots are filtered). A post view = one visitor opening a post once per day. Country comes from the IP and is approximate.</p>';
 $('dash').innerHTML=h;
}
async function resetData(w){if(!confirm('Are you sure? This cannot be undone.'))return;await api('/api/admin/reset','POST',{what:w});alert('Done');loadPosts();if($('t_stats').classList.contains('on'))loadStats();}
async function start(){
 show(true);
 var r=await api('/api/admin/page');cfg=r.page;
 buildLinks();bind();draw();
 $('ths').innerHTML=TH.map(function(t,i){return '<button class="thb" data-i="'+i+'" style="background:'+(t.bg.type==='gradient'?'linear-gradient('+t.bg.angle+'deg,'+t.bg.c1+','+t.bg.c2+')':t.bg.c1)+';color:'+t.tx+'">'+t.n+'</button>';}).join('');
 $('l1').textContent=location.origin+'/';$('l2').textContent=location.origin+'/?src=instagram';$('l3').textContent=location.origin+'/?src=telegram';$('l4').textContent=location.origin+'/posts';
}
document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){tab(b.dataset.t);};});
document.querySelectorAll('#rg button').forEach(function(b){b.onclick=function(){loadStats(+b.dataset.d);};});
$('ths').addEventListener('click',function(e){var b=e.target.closest('.thb');if(b)applyTh(+b.dataset.i);});
$('addl').onclick=function(){cfg.links.push({id:newId(),label:'New Link',url:'',icon:'',pr:false,on:true});buildLinks();draw();};
$('lks').addEventListener('input',function(e){
 var r=e.target.closest('.row');if(!r)return;var l=L(r.dataset.id),t=e.target.classList;
 if(t.contains('fl'))l.label=e.target.value;else if(t.contains('fu'))l.url=e.target.value;else if(t.contains('fi'))l.icon=e.target.value;else if(t.contains('fp'))l.pr=e.target.checked;else if(t.contains('fv'))l.on=e.target.checked;
 draw();
});
$('lks').addEventListener('click',function(e){
 var r=e.target.closest('.row');if(!r)return;var id=r.dataset.id;
 if(e.target.dataset.del){cfg.links=cfg.links.filter(function(x){return x.id!==id;});buildLinks();draw();}
 else if(e.target.dataset.dup){var i=cfg.links.indexOf(L(id));cfg.links.splice(i+1,0,Object.assign({},L(id),{id:newId(),label:L(id).label+' (copy)'}));buildLinks();draw();}
});
$('lks').addEventListener('pointerdown',function(e){var h=e.target.closest('.hdl');if(!h)return;drag=h.closest('.row');drag.classList.add('drg');e.preventDefault();});
document.addEventListener('pointermove',function(e){
 if(!drag)return;e.preventDefault();
 var el=document.elementFromPoint(e.clientX,e.clientY),r=el&&el.closest('.row');
 if(r&&r!==drag&&r.parentNode===drag.parentNode){var b=r.getBoundingClientRect();r.parentNode.insertBefore(drag,e.clientY>b.top+b.height/2?r.nextSibling:r);}
},{passive:false});
document.addEventListener('pointerup',function(){
 if(!drag)return;drag.classList.remove('drg');drag=null;
 var ids=[].map.call($('lks').querySelectorAll('.row'),function(r){return r.dataset.id;});
 cfg.links=ids.map(function(id){return L(id);});draw();
});
$('plist').addEventListener('click',async function(e){
 var r=e.target.closest('.pi');if(!r)return;var p=P(+r.dataset.id);
 if(e.target.dataset.edit){$('f_id').value=p.id;$('f_title').value=p.title;$('f_thumb').value=p.thumb||'';$('f_link').value=p.link||'';$('f_dur').value=p.duration||'';$('f_pin').checked=!!p.pinned;$('formh').textContent='Edit post #'+p.id;window.scrollTo(0,0);}
 else if(e.target.dataset.pin){await api('/api/admin/posts/'+p.id,'PUT',{title:p.title,thumb:p.thumb,link:p.link,duration:p.duration,pinned:p.pinned?0:1});loadPosts();}
 else if(e.target.dataset.pdel){if(!confirm('Delete post #'+p.id+'?'))return;await api('/api/admin/posts/'+p.id,'DELETE');loadPosts();}
});
$('exp').onclick=function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(cfg,null,2)],{type:'application/json'}));a.download='page-backup.json';a.click();};
$('imp').onchange=function(e){
 var f=e.target.files[0];if(!f)return;var r=new FileReader();
 r.onload=function(){var o;try{o=JSON.parse(r.result);}catch(x){alert('Invalid backup file');return;}o.off=cfg.off;if(!o.links)o.links=[];cfg=o;save();};
 r.readAsText(f);e.target.value='';
};
$('savep').onclick=savePost;$('clrp').onclick=clearf;
$('rv').onclick=function(){resetData('views');};$('rs').onclick=function(){resetData('stats');};
$('sbtn').onclick=save;$('sw').onclick=toggleSite;
$('lo').onclick=async function(){await fetch('/api/admin/logout',{method:'POST'});show(false);};
$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
$('lgn').onclick=login;
fetch('/api/admin/page').then(function(r){if(r.ok)start();else show(false);});
`;

// ---------- pages ----------
const seoHead = (c, title, desc, img) =>
  '<meta name="description" content="' + esc(desc) + '"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '">' +
  (img ? '<meta property="og:image" content="' + esc(img) + '">' : '') + (c.seo.icon ? '<link rel="icon" href="' + esc(c.seo.icon) + '">' : '');

async function homePage(env, c) {
  const pc = { ...c, links: c.links.filter((l) => l.on) };
  if (c.posts.latest) {
    const { results } = await env.DB.prepare('SELECT id,title,thumb,duration,views,created_at,pinned FROM posts ORDER BY pinned DESC, id DESC LIMIT ?').bind(c.posts.count).all();
    pc.latest = results;
  }
  const head = seoHead(c, c.seo.title || c.title, c.seo.desc || c.bio, c.seo.img || c.avatar) + '<script>window.CFG=' + safeJson(pc) + '</script>';
  return html(shell(c.seo.title || c.title, head, '<div id="pg" class="pg"></div>', RENDER_JS + HOME_JS), 200, { 'Cache-Control': 'no-store' });
}
function postsPage(c) {
  const head = seoHead(c, 'Posts - ' + c.site, c.seo.desc || c.bio, c.seo.img || c.avatar) + '<script>window.CFG=' + safeJson({ ...c, links: [] }) + '</script>';
  return html(shell('Posts - ' + c.site, head, '<div id="pg" class="pg"></div>', RENDER_JS + POSTS_JS), 200, { 'Cache-Control': 'no-store' });
}
function offPage(c) {
  const head = '<meta name="robots" content="noindex"><script>window.CFG=' + safeJson({ ...c, links: [] }) + '</script>';
  return html(shell(c.off.title, head, '<div id="pg" class="pg"></div>', RENDER_JS + OFF_JS), 503, { 'Cache-Control': 'no-store', 'Retry-After': '3600' });
}

function legal(c, title, inner) {
  const body = '<div class="doc"><p class="mu"><a href="/">&larr; ' + esc(c.site) + '</a></p><h1>' + title + '</h1><p class="mu">Last updated: ' + dayStr() + '</p>' + inner + '</div>';
  return html(shell(title + ' - ' + c.site, '', body, ''), 200, { 'Cache-Control': 'public, max-age=300' });
}
function termsPage(c) {
  const n = esc(c.site), m = c.contact ? esc(c.contact) : 'the site owner through the contact channels listed on the page';
  return legal(c, 'Terms &amp; Conditions',
    '<h2>1. Acceptance</h2><p>By using this page (' + n + ') you agree to these Terms. If you do not agree, please do not use the page.</p>' +
    '<h2>2. Age requirement (18+)</h2><p>The links and the content behind them are intended only for people aged <b>18 or older</b>. If you are under 18, leave this page immediately. By tapping "Yes" on the age alert you confirm that you are at least 18 years old.</p>' +
    '<h2>3. Our content</h2><ul><li>This page is a directory of links. We do not host content from Telegram, YouTube, Instagram or any other platform.</li><li>We only share content that we own or have permission to share.</li><li>We do not share or promote private, non-consensual or leaked content.</li></ul>' +
    '<h2>4. Prohibited use</h2><ul><li>Violating anyone\'s privacy or rights.</li><li>Sharing illegal, abusive or hateful material.</li><li>Hacking the page, spamming it with bots, or scraping data in abusive ways.</li></ul>' +
    '<h2>5. Third-party links</h2><p>Links on this page lead to other platforms. Their content, policies and safety are the responsibility of those platforms, not ours.</p>' +
    '<h2>6. Content removal requests</h2><p>If you believe any link or content violates your rights or privacy, contact us and we will review it and remove it promptly. Contact: ' + m + '.</p>' +
    '<h2>7. Limitation of liability</h2><p>The page is provided "as is". We do not guarantee the accuracy or availability of any linked content.</p>' +
    '<h2>8. Changes</h2><p>We may update these Terms at any time. Continued use of the page means you accept the updated Terms.</p>');
}
function privacyPage(c) {
  const m = c.contact ? esc(c.contact) : 'the site owner through the contact channels listed on the page';
  return legal(c, 'Privacy Policy',
    '<h2>1. What we collect</h2><ul><li>We do not ask for your name, phone number or email. There are no visitor accounts.</li><li>Anonymous visit statistics: a hashed device identifier, approximate country and city, device type (mobile/desktop), and where you came from (for example Instagram or Telegram).</li><li>Counts of how many times each link or post is opened.</li></ul>' +
    '<h2>2. How we use it</h2><p>This information is used only to understand how many people visit the page and which links work best. We do not sell it or share it with anyone.</p>' +
    '<h2>3. Browser storage</h2><p>Your 18+ confirmation is saved in your browser so you are not asked every time. It contains no personal data. You can remove it by clearing your browser data.</p>' +
    '<h2>4. Other platforms</h2><p>When you open a link you go to another platform such as Telegram, YouTube or Instagram. Their own privacy policies apply there.</p>' +
    '<h2>5. Children</h2><p>This page is not intended for anyone under 18, and we do not knowingly collect data from people under 18.</p>' +
    '<h2>6. Retention</h2><p>Anonymous statistics are kept until the site owner deletes them.</p>' +
    '<h2>7. Contact</h2><p>For privacy questions or data removal requests, contact: ' + m + '.</p>');
}

function adminPage() {
  const cf = (label, p) => '<label>' + label + '</label><input type="color" data-p="' + p + '">';
  const sel = (label, p, opts) => '<label>' + label + '</label><select data-p="' + p + '">' + opts.map((o) => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select>';
  const body =
    '<div id="login" class="center" style="display:none"><div class="box fm" style="width:100%;max-width:340px"><h2>Admin Login</h2><input id="pw" type="password" placeholder="Password"><div class="btns"><button id="lgn" class="btn full">Login</button></div><p id="msg" style="color:#e5484d;margin-top:10px"></p></div></div>' +
    '<div id="app" style="display:none"><div id="offbar" class="offbar" style="display:none">The website is currently OFF. Visitors see the closed page. You can still view it while logged in.</div>' +
    '<header class="hd"><b style="font-size:17px">&#9881; Page Builder</b><div class="hr"><button class="btn sm ok" id="sw">Site: ON</button><button class="btn sm" id="sbtn">Save</button><a class="btn g sm" href="/" target="_blank">Open</a><button class="btn g sm" id="lo">Logout</button></div></header>' +
    '<nav class="tabs"><button data-t="links" class="on">Links</button><button data-t="posts">Posts</button><button data-t="design">Design</button><button data-t="set">Settings</button><button data-t="stats">Stats</button><button data-t="pv" class="tpv">Preview</button></nav>' +
    '<div class="lay"><div class="ed">' +
    // links
    '<section id="t_links" class="tp on"><div class="box"><h2>Links / Buttons</h2><p class="mu" style="font-size:13px;margin-bottom:10px">Hold &#8942;&#8942; and drag to reorder. Press <b>Save</b> after making changes.</p><div id="lks"></div><div class="btns"><button class="btn" id="addl">+ Add link</button></div></div></section>' +
    // posts
    '<section id="t_posts" class="tp"><div class="box fm"><h2 id="formh">New post</h2><input type="hidden" id="f_id"><label>Title</label><input id="f_title"><label>Thumbnail image URL</label><input id="f_thumb" placeholder="https://..."><label>Post link (opens directly when a visitor taps the post)</label><input id="f_link" placeholder="https://..."><label>Duration (optional, e.g. 15:14)</label><input id="f_dur"><label class="ck"><input type="checkbox" id="f_pin"> Pin to top</label><div class="btns"><button class="btn" id="savep">Save post</button><button class="btn g" id="clrp">Clear</button></div></div>' +
    '<div class="box"><h2>All posts <span id="pcnt" class="mu"></span></h2><div id="plist"></div></div></section>' +
    // design
    '<section id="t_design" class="tp"><div class="box"><h2>Ready themes</h2><div class="ths" id="ths"></div></div>' +
    '<div class="box fm"><h2>Profile</h2><label>Photo / logo URL</label><input data-p="avatar" placeholder="https://..."><label>Title</label><input data-p="title"><label>Bio</label><textarea data-p="bio" rows="3"></textarea></div>' +
    '<div class="box fm"><h2>Background</h2>' + sel('Type', 'bg.type', [['color', 'Solid colour'], ['gradient', 'Gradient'], ['image', 'Image']]) + cf('Colour 1', 'bg.c1') + cf('Colour 2 (gradient)', 'bg.c2') +
    '<label>Gradient angle</label><input type="range" min="0" max="360" data-p="bg.angle"><label>Background image URL</label><input data-p="bg.img" placeholder="https://...">' +
    sel('Image position', 'bg.pos', [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]) + '<label>Image blur</label><input type="range" min="0" max="20" data-p="bg.blur">' +
    sel('Image overlay', 'bg.ovt', [['none', 'None'], ['solid', 'Solid colour'], ['gradient', 'Gradient']]) + cf('Overlay colour 1', 'bg.oc1') + cf('Overlay colour 2 (gradient)', 'bg.oc2') +
    '<label>Overlay gradient angle</label><input type="range" min="0" max="360" data-p="bg.oang"><label>Overlay opacity</label><input type="range" min="0" max="1" step="0.05" data-p="bg.ov"></div>' +
    '<div class="box fm"><h2>Text</h2>' + cf('Text colour', 'tx') + sel('Font', 'font', [['sans', 'Modern Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['round', 'Rounded']]) + '</div>' +
    '<div class="box fm"><h2>Buttons</h2>' + sel('Style', 'btn.style', [['grad', 'Gradient'], ['fill', 'Solid'], ['outline', 'Outline'], ['glass', 'Glass']]) + cf('Colour 1', 'btn.c1') + cf('Colour 2 (gradient / premium)', 'btn.c2') + cf('Button text colour', 'btn.tc') +
    sel('Size', 'btn.size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]) + sel('Text alignment', 'btn.align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]) + sel('Width', 'btn.w', [['full', 'Full width'], ['narrow', 'Narrow']]) +
    '<label>Corner roundness</label><input type="range" min="0" max="40" data-p="btn.r"><label class="ck"><input type="checkbox" data-p="btn.anim"> Hover / tap animation</label></div></section>' +
    // settings
    '<section id="t_set" class="tp"><div class="box fm"><h2>Website status</h2><p class="mu" style="font-size:13px">Use the <b>Site: ON/OFF</b> button in the top bar to close or open the website instantly. While it is OFF visitors see the message below (you can still view the site while logged in).</p><label>Closed page title</label><input data-p="off.title"><label>Closed page message</label><textarea data-p="off.text" rows="3"></textarea></div>' +
    '<div class="box fm"><h2>Posts</h2><label class="ck"><input type="checkbox" data-p="posts.btn"> Show a Posts button on the home page</label><label>Button label</label><input data-p="posts.label"><label class="ck"><input type="checkbox" data-p="posts.latest"> Show latest posts section on the home page</label><label>Section title</label><input data-p="posts.title"><label>Number of posts (1-12)</label><input type="number" min="1" max="12" data-p="posts.count"></div>' +
    '<div class="box fm"><h2>18+ age alert</h2><label class="ck"><input type="checkbox" data-p="age.on"> Show the 18+ alert when the page opens</label><label>Title</label><input data-p="age.title"><label>Text</label><textarea data-p="age.text" rows="3"></textarea><label>Yes button</label><input data-p="age.yes"><label>No button (sends the visitor to Google)</label><input data-p="age.no"></div>' +
    '<div class="box fm"><h2>SEO &amp; sharing</h2><label>Page title (browser tab and Google)</label><input data-p="seo.title"><label>Description</label><textarea data-p="seo.desc" rows="2"></textarea><label>Share image URL</label><input data-p="seo.img" placeholder="https://..."><label>Favicon URL</label><input data-p="seo.icon" placeholder="https://..."></div>' +
    '<div class="box fm"><h2>Site &amp; legal pages</h2><label>Site name (used in Terms and Privacy)</label><input data-p="site"><label>Contact email or Telegram id (for takedown requests)</label><input data-p="contact"><div class="btns"><a class="btn g sm" href="/terms" target="_blank">View Terms</a><a class="btn g sm" href="/privacy" target="_blank">View Privacy</a></div></div>' +
    '<div class="box"><h2>Backup &amp; restore</h2><p class="mu" style="font-size:13px;margin-bottom:10px">Saves your design and links as a file. Restoring replaces the current design (posts are not included).</p><div class="btns"><button class="btn g sm" id="exp">Download backup</button><label class="btn g sm" style="cursor:pointer">Restore backup<input id="imp" type="file" accept="application/json" style="display:none"></label></div></div>' +
    '<div class="box"><h2>Important links</h2><p class="mu" style="font-size:13px;margin-bottom:6px">Website</p><code id="l1"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Posts page</p><code id="l4"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Instagram bio link (tracked)</p><code id="l2"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Telegram link (tracked)</p><code id="l3"></code></div>' +
    '<div class="box"><h2>Data reset</h2><div class="btns"><button class="btn g sm" id="rv">Reset post views</button><button class="btn r sm" id="rs">Clear analytics</button></div></div></section>' +
    // stats
    '<section id="t_stats" class="tp"><div class="rg" id="rg" style="display:flex;gap:8px;margin-bottom:14px"><button data-d="7" class="on">7 days</button><button data-d="30">30 days</button><button data-d="90">90 days</button></div><div id="dash"></div></section>' +
    '</div><aside id="t_pv" class="tp"><div class="phone"><div id="pv" class="pg"></div></div></aside></div></div>';
  return html(shell('Admin', '<meta name="robots" content="noindex,nofollow">', body, RENDER_JS + ADMIN_JS), 200, { 'Cache-Control': 'no-store' });
}

// ---------- main ----------
export default {
  async fetch(req, env, ctx) {
    if (!env.DB) return new Response('D1 binding "DB" missing', { status: 500 });
    await init(env);
    const u = new URL(req.url);
    const path = u.pathname, method = req.method, ua = req.headers.get('User-Agent') || '';

    try {
      const adminRoute = path === '/admin' || path.startsWith('/api/admin/');

      // ----- public routes (blocked when the site is switched OFF) -----
      if (!adminRoute) {
        const c = await getPage(env);
        if (c.off.on && !(await isAdmin(req, env))) return path.startsWith('/api/') ? json({ error: 'closed' }, 503) : offPage(c);

        if (path === '/' && method === 'GET') {
          ctx.waitUntil(trackVisit(req, env, u).catch(() => {}));
          return homePage(env, c);
        }
        if (path === '/posts' && method === 'GET') {
          ctx.waitUntil(trackVisit(req, env, u).catch(() => {}));
          return postsPage(c);
        }
        if (path === '/api/posts' && method === 'GET') {
          const pg = Math.max(1, parseInt(u.searchParams.get('page')) || 1);
          const q = (u.searchParams.get('q') || '').trim().slice(0, 60);
          const lim = 12, off = (pg - 1) * lim;
          const st = q
            ? env.DB.prepare('SELECT id,title,thumb,duration,views,created_at,pinned FROM posts WHERE title LIKE ? ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?').bind('%' + q + '%', lim, off)
            : env.DB.prepare('SELECT id,title,thumb,duration,views,created_at,pinned FROM posts ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?').bind(lim, off);
          const { results } = await st.all();
          return json({ posts: results, more: results.length === lim }, 200, { 'Cache-Control': 'public, max-age=20' });
        }

        let m = path.match(/^\/p\/(\d+)$/);
        if (m && method === 'GET') {
          const p = await env.DB.prepare('SELECT id,link FROM posts WHERE id=?').bind(+m[1]).first();
          if (!p || !p.link || !okUrl(p.link)) return redirect('/posts');
          if (!isBot(ua)) ctx.waitUntil(vidOf(req, env).then((v) => countPostView(env, p.id, v)).catch(() => {}));
          return redirect(p.link);
        }

        m = path.match(/^\/l\/([a-z0-9]{4,12})$/i);
        if (m && method === 'GET') {
          const l = c.links.find((x) => x.id === m[1] && x.on);
          if (!l) return redirect('/');
          if (!isBot(ua)) ctx.waitUntil(env.DB.prepare('INSERT INTO lclicks (day,lid,c) VALUES (?,?,1) ON CONFLICT(day,lid) DO UPDATE SET c=c+1').bind(dayStr(), l.id).run().catch(() => {}));
          return redirect(l.url);
        }

        if (path === '/terms' && method === 'GET') return termsPage(c);
        if (path === '/privacy' && method === 'GET') return privacyPage(c);
        return redirect('/');
      }

      // ----- admin -----
      if (path === '/admin' && method === 'GET') return adminPage();

      if (path === '/api/admin/login' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && env.SESSION_SECRET && b.password === env.ADMIN_PASSWORD) {
          const tok = await makeToken(env);
          return json({ ok: true }, 200, { 'Set-Cookie': 'adm=' + tok + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800' });
        }
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: 'bad password' }, 401);
      }
      if (path === '/api/admin/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': 'adm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });

      if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);

      if (path === '/api/admin/page' && method === 'GET') return json({ page: await getPage(env, true) });
      if (path === '/api/admin/page' && method === 'POST') {
        const c = clean(await req.json());
        await savePage(env, c);
        return json({ ok: true, page: c });
      }
      if (path === '/api/admin/site' && method === 'POST') {
        const b = await req.json();
        const c = await getPage(env, true);
        c.off.on = !!b.off;
        await savePage(env, c);
        return json({ ok: true, off: c.off.on });
      }
      if (path === '/api/admin/stats' && method === 'GET') return json(await stats(env, parseInt(u.searchParams.get('days'))));

      if (path === '/api/admin/posts' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY pinned DESC, id DESC LIMIT 500').all();
        return json({ posts: results });
      }
      if (path === '/api/admin/posts' && method === 'POST') {
        const b = await req.json();
        const title = str(b.title, 200);
        if (!title) return json({ error: 'Title is required' });
        if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URLs must start with http:// or https://' });
        await env.DB.prepare('INSERT INTO posts (title,thumb,link,duration,views,created_at,pinned) VALUES (?,?,?,?,0,?,?)')
          .bind(title, b.thumb || '', b.link || '', str(b.duration, 12), Date.now(), b.pinned ? 1 : 0).run();
        return json({ ok: true });
      }
      let m = path.match(/^\/api\/admin\/posts\/(\d+)$/);
      if (m && method === 'PUT') {
        const b = await req.json();
        const title = str(b.title, 200);
        if (!title) return json({ error: 'Title is required' });
        if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URLs must start with http:// or https://' });
        await env.DB.prepare('UPDATE posts SET title=?,thumb=?,link=?,duration=?,pinned=? WHERE id=?')
          .bind(title, b.thumb || '', b.link || '', str(b.duration, 12), b.pinned ? 1 : 0, +m[1]).run();
        return json({ ok: true });
      }
      if (m && method === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM posts WHERE id=?').bind(+m[1]), env.DB.prepare('DELETE FROM post_views WHERE post_id=?').bind(+m[1])]);
        return json({ ok: true });
      }
      if (path === '/api/admin/reset' && method === 'POST') {
        const b = await req.json();
        if (b.what === 'views') await env.DB.batch([env.DB.prepare('UPDATE posts SET views=0'), env.DB.prepare('DELETE FROM post_views')]);
        else if (b.what === 'stats') await env.DB.batch([env.DB.prepare('DELETE FROM visits'), env.DB.prepare('DELETE FROM lclicks')]);
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
