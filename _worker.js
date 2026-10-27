// ============================================================
// Pro Post Feed - Cloudflare Pages (_worker.js) / Workers + D1
// Features: pro UI, dark/light + accent colour, direct post links,
// Telegram popup, /go loading page, real analytics, admin panel
// Bindings: D1 -> DB | Secrets: ADMIN_PASSWORD, SESSION_SECRET
// ============================================================

const enc = new TextEncoder();
let ready = false;

const DEF = {
  site_name: 'My Box',
  tagline: 'Latest posts - fast, simple aur free',
  logo_url: '',
  telegram_url: 'https://t.me/yourchannel',
  countdown: '5',
  theme_default: 'dark',
  accent: '#6c5ce7',
  popup_on: '1',
  popup_title: 'Telegram Channel Join Karo',
  popup_text: 'Latest updates sabse pehle paane ke liye hamare Telegram channel se judo.',
  popup_img: '',
  popup_btn: 'Join Telegram',
  popup_link: '',
  popup_delay: '2',
  popup_freq: '6',
};
const URLK = ['logo_url', 'telegram_url', 'popup_img', 'popup_link'];
const IST = 19800000;
const dayStr = (off = 0) => new Date(Date.now() + IST - off * 864e5).toISOString().slice(0, 10);

// ---------- CSS ----------
const CSS = String.raw`
:root,[data-theme=dark]{--bg:#0f1115;--bg2:#161a21;--card:#1a1f27;--bd:#262c36;--tx:#eef1f6;--mu:#8b94a3;--sh:0 8px 30px rgba(0,0,0,.35)}
[data-theme=light]{--bg:#f4f6fb;--bg2:#eceff6;--card:#fff;--bd:#e3e7ef;--tx:#151a23;--mu:#667085;--sh:0 8px 30px rgba(20,30,60,.08)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--tx);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.4;-webkit-tap-highlight-color:transparent}
a{color:inherit;text-decoration:none}
.wrap{max-width:1100px;margin:0 auto;padding:0 14px}
.hd{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd)}
.hdin{display:flex;align-items:center;gap:10px;height:62px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;white-space:nowrap}
.lg{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 50%,#000));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;overflow:hidden;flex:none}
.lg img{width:100%;height:100%;object-fit:cover}
.sw{flex:1;display:flex;gap:8px;justify-content:flex-end;min-width:0}
.search{flex:1;max-width:360px;min-width:0;background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:10px 14px;color:var(--tx);font-size:15px;outline:none}
.search:focus{border-color:var(--ac)}
.ib{background:var(--card);border:1px solid var(--bd);color:var(--tx);width:42px;height:42px;border-radius:12px;cursor:pointer;font-size:18px;flex:none}
.ib.sm{width:34px;height:34px;font-size:16px;border-radius:10px}
.hero{margin:18px auto 6px}
.hb{background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 45%,#000));color:#fff;border-radius:22px;padding:28px 22px;box-shadow:var(--sh)}
.hb h1{font-size:26px;margin-bottom:6px}
.hb p{opacity:.9;font-size:15px}
.sec h2{font-size:20px;margin:20px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;overflow:hidden;box-shadow:var(--sh);transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-3px);border-color:var(--ac)}
.th{position:relative;display:block;aspect-ratio:16/10;background:var(--bg2)}
.th img{width:100%;height:100%;object-fit:cover;display:block}
.ph{height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--mu)}
.dur{position:absolute;right:10px;bottom:10px;background:rgba(0,0,0,.78);color:#fff;padding:3px 8px;border-radius:8px;font-size:12px}
.meta{padding:12px 14px 14px}
.t{font-weight:600;font-size:16px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:42px}
.row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:var(--mu);font-size:13px}
.sk{height:270px;border-radius:16px;background:linear-gradient(90deg,var(--card) 25%,var(--bg2) 50%,var(--card) 75%);background-size:200% 100%;animation:sh 1.2s infinite}
@keyframes sh{to{background-position:-200% 0}}
.empty{grid-column:1/-1;text-align:center;color:var(--mu);padding:40px 0}
footer{text-align:center;color:var(--mu);font-size:13px;padding:30px 14px}
.btn{display:inline-block;background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 70%,#000));color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;text-align:center}
.btn.g{background:var(--card);color:var(--tx);border:1px solid var(--bd)}
.btn.r{background:#e5484d}
.btn.full{display:block;width:100%}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;z-index:50;animation:fi .25s}
.pp{background:var(--card);border-radius:22px;max-width:380px;width:100%;overflow:hidden;box-shadow:var(--sh);position:relative;animation:pop .3s}
.pp img{width:100%;max-height:210px;object-fit:cover;display:block}
.pp .b{padding:20px;text-align:center}
.pp h3{font-size:20px;margin-bottom:8px}
.pp p{color:var(--mu);font-size:14px;margin-bottom:16px}
.x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:20px;cursor:pointer;z-index:2}
.later{background:none;border:0;color:var(--mu);margin-top:12px;cursor:pointer;font-size:14px}
@keyframes fi{from{opacity:0}}
@keyframes pop{from{transform:scale(.9);opacity:0}}
.center{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:18px}
.ring{width:96px;height:96px;border-radius:50%;border:6px solid var(--bd);border-top-color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;animation:sp 1s linear infinite}
.ring span{animation:sp2 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes sp2{to{transform:rotate(-360deg)}}
.mu{color:var(--mu)}
/* admin */
.box{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:16px;margin-bottom:16px}
.box h2{font-size:17px;margin-bottom:10px}
.fm label{display:block;font-size:13px;color:var(--mu);margin:10px 0 4px}
.fm input,.fm select,.fm textarea{width:100%;background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:11px;color:var(--tx);font-size:15px;outline:none;font-family:inherit}
.fm input[type=color]{height:46px;padding:3px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.tabs{display:flex;gap:8px;overflow-x:auto;padding:14px 14px 4px;max-width:1100px;margin:0 auto}
.tabs button,.rg button{flex:none;background:var(--card);border:1px solid var(--bd);color:var(--tx);padding:9px 16px;border-radius:999px;cursor:pointer;font-size:14px}
.tabs button.on,.rg button.on{background:var(--ac);border-color:var(--ac);color:#fff}
.rg{display:flex;gap:8px;margin:14px 0}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px}
@media(min-width:700px){.stats{grid-template-columns:repeat(4,1fr)}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.st{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:14px}
.st b{display:block;font-size:26px}
.st span{color:var(--mu);font-size:13px}
.bars{display:flex;align-items:flex-end;gap:3px;height:160px;margin-top:10px}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.bar i{display:block;width:100%;background:var(--ac);border-radius:4px 4px 0 0;min-height:2px}
.bar small{font-size:9px;color:var(--mu);margin-top:3px;height:12px}
.li{margin-bottom:10px}
.lt{display:flex;justify-content:space-between;font-size:14px}
.lb{height:6px;background:var(--bg2);border-radius:6px;margin-top:4px;overflow:hidden}
.lb i{display:block;height:100%;background:var(--ac);border-radius:6px}
.pi{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--bd)}
.pi img,.pi .nt{width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--bg2);flex:none}
.pi .in{flex:1;min-width:0;font-size:14px}
.pi .in b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi button{background:var(--bg2);color:var(--tx);border:0;border-radius:8px;padding:7px 10px;cursor:pointer}
.sw2{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.sw2 button{width:34px;height:34px;border-radius:50%;border:2px solid var(--bd);cursor:pointer}
code{background:var(--bg2);padding:2px 6px;border-radius:6px;font-size:13px;word-break:break-all}
`;

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (b, status = 200, h = {}) => new Response(b, { status, headers: { 'Content-Type': 'text/html;charset=utf-8', ...h } });
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...h } });
const okUrl = (u) => !u || /^https?:\/\/[^\s]+$/i.test(u);

function themeInit(s) {
  return '<script>(function(){var d="' + s.theme_default + '",t=d;try{t=localStorage.getItem("th")||d}catch(e){}if(t==="auto")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)})()</script>';
}
function layout(s, title, body, head, script) {
  return '<!doctype html><html lang="hi" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) + '</title>' + themeInit(s) + (head || '') + '<style>' + CSS + ':root{--ac:' + s.accent + '}</style></head><body>' + body + (script ? '<script>' + script + '</script>' : '') + '</body></html>';
}

async function init(env) {
  if (ready) return;
  const d = env.DB;
  await d.batch([
    d.prepare('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, thumb TEXT, link TEXT, duration TEXT, views INTEGER DEFAULT 0, created_at INTEGER)'),
    d.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    d.prepare('CREATE TABLE IF NOT EXISTS visits (day TEXT, vid TEXT, src TEXT, country TEXT, city TEXT, device TEXT, hits INTEGER DEFAULT 1, ts INTEGER, PRIMARY KEY (day, vid))'),
    d.prepare('CREATE TABLE IF NOT EXISTS post_views (post_id INTEGER, day TEXT, vid TEXT, PRIMARY KEY (post_id, day, vid))'),
    d.prepare('CREATE TABLE IF NOT EXISTS events (day TEXT, name TEXT, c INTEGER DEFAULT 0, PRIMARY KEY (day, name))'),
    d.prepare('CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day)'),
  ]);
  ready = true;
}

async function getSettings(env) {
  const s = { ...DEF };
  const { results } = await env.DB.prepare('SELECT k,v FROM settings').all();
  for (const r of results) if (r.k in DEF) s[r.k] = r.v;
  if (!/^#[0-9a-f]{6}$/i.test(s.accent)) s.accent = DEF.accent;
  if (!['dark', 'light', 'auto'].includes(s.theme_default)) s.theme_default = 'dark';
  return s;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function makeToken(env) {
  const exp = Date.now() + 7 * 864e5;
  return exp + '.' + (await hmac(env.SESSION_SECRET, String(exp)));
}
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

function srcOf(req, url) {
  const p = (url.searchParams.get('src') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  if (p) return p;
  const ua = req.headers.get('User-Agent') || '';
  let h = '';
  try { h = new URL(req.headers.get('Referer') || '').hostname.toLowerCase(); } catch (e) {}
  if (h === url.hostname) h = '';
  if (/instagram\.com$/.test(h) || /Instagram/i.test(ua)) return 'instagram';
  if (/(^|\.)t\.me$/.test(h) || /telegram/.test(h)) return 'telegram';
  if (/facebook|fb\.com|fb\.me/.test(h) || /FBAN|FBAV/.test(ua)) return 'facebook';
  if (/youtube|youtu\.be/.test(h)) return 'youtube';
  if (/google\./.test(h)) return 'google';
  if (/(^|\.)x\.com$|twitter|(^|\.)t\.co$/.test(h)) return 'twitter';
  if (/whatsapp/.test(h)) return 'whatsapp';
  if (/bing|duckduckgo|yahoo/.test(h)) return 'search';
  if (h) return h.replace(/^www\./, '').slice(0, 30);
  return 'direct';
}

async function trackVisit(req, env, url) {
  const ua = req.headers.get('User-Agent') || '';
  if (isBot(ua)) return;
  const cf = req.cf || {};
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  await env.DB.prepare('INSERT INTO visits (day,vid,src,country,city,device,hits,ts) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(day,vid) DO UPDATE SET hits=hits+1, ts=excluded.ts')
    .bind(dayStr(), await vidOf(req, env), srcOf(req, url), cf.country || '??', String(cf.city || '').slice(0, 40), device, Date.now()).run();
}
const bump = (env, name) => env.DB.prepare('INSERT INTO events (day,name,c) VALUES (?,?,1) ON CONFLICT(day,name) DO UPDATE SET c=c+1').bind(dayStr(), name).run();

async function countPostView(env, id, vid) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO post_views (post_id,day,vid) VALUES (?,?,?)').bind(id, dayStr(), vid).run();
  if (r.meta && r.meta.changes) await env.DB.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(id).run();
}

async function stats(env, days) {
  days = Math.min(Math.max(days || 7, 1), 90);
  const from = dayStr(days - 1);
  const d = env.DB;
  const [daily, srcs, ctry, city, dev, ev, tops, tot, act, clk, pc] = await d.batch([
    d.prepare('SELECT day, COUNT(*) v, SUM(hits) h FROM visits WHERE day>=? GROUP BY day').bind(from),
    d.prepare('SELECT src k, COUNT(*) c FROM visits WHERE day>=? GROUP BY src ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare('SELECT country k, COUNT(*) c FROM visits WHERE day>=? GROUP BY country ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare("SELECT city k, COUNT(*) c FROM visits WHERE day>=? AND city<>'' GROUP BY city ORDER BY c DESC LIMIT 10").bind(from),
    d.prepare('SELECT device k, COUNT(*) c FROM visits WHERE day>=? GROUP BY device ORDER BY c DESC').bind(from),
    d.prepare('SELECT name k, SUM(c) c FROM events WHERE day>=? GROUP BY name').bind(from),
    d.prepare('SELECT p.id, p.title, COUNT(*) c FROM post_views v JOIN posts p ON p.id=v.post_id WHERE v.day>=? GROUP BY p.id ORDER BY c DESC LIMIT 5').bind(from),
    d.prepare('SELECT COUNT(DISTINCT vid) u, COALESCE(SUM(hits),0) h FROM visits WHERE day>=?').bind(from),
    d.prepare('SELECT COUNT(*) a FROM visits WHERE ts>?').bind(Date.now() - 30 * 60 * 1000),
    d.prepare('SELECT COUNT(*) c FROM post_views WHERE day>=?').bind(from),
    d.prepare('SELECT COUNT(*) n, COALESCE(SUM(views),0) v FROM posts'),
  ]);
  const map = {};
  daily.results.forEach((r) => (map[r.day] = r));
  const filled = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayStr(i), r = map[k];
    filled.push({ day: k, v: r ? r.v : 0, h: r ? r.h : 0 });
  }
  return {
    daily: filled, today: filled[filled.length - 1], sources: srcs.results, countries: ctry.results, cities: city.results,
    devices: dev.results, events: ev.results, tops: tops.results, range: tot.results[0], active: act.results[0].a,
    clicks: clk.results[0].c, posts: pc.results[0],
  };
}

// ---------- client scripts (String.raw: no backticks, no dollar-brace) ----------
const TT_JS = String.raw`
var tt=document.getElementById('tt');
if(tt)tt.onclick=function(){var c=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',c);try{localStorage.setItem('th',c)}catch(e){}};
`;

const FEED_JS = String.raw`
var C=window.CFG||{},page=1,busy=false,more=true,q='';
var list=document.getElementById('list');
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function ago(t){var s=(Date.now()-t)/1000;if(!t||s<0)return '';if(s<3600)return Math.max(1,Math.floor(s/60))+' min pehle';if(s<86400)return Math.floor(s/3600)+' ghante pehle';if(s<2592000)return Math.floor(s/86400)+' din pehle';return Math.floor(s/2592000)+' mahine pehle';}
function card(p){
 return '<article class="card"><a class="th" href="/p/'+p.id+'" target="_blank" rel="noopener">'+(p.thumb?'<img loading="lazy" decoding="async" src="'+esc(p.thumb)+'" alt="">':'<div class="ph">&#9654;</div>')+(p.duration?'<span class="dur">'+esc(p.duration)+'</span>':'')+'</a><div class="meta"><a class="t" href="/p/'+p.id+'" target="_blank" rel="noopener">'+esc(p.title)+'</a><div class="row"><span>&#128065; '+fmt(p.views)+' &middot; '+ago(p.created_at)+'</span><button class="ib sm sh" data-id="'+p.id+'" data-t="'+esc(p.title)+'" aria-label="Share">&#10150;</button></div></div></article>';
}
async function load(reset){
 if(busy)return;
 if(reset){page=1;more=true;}
 if(!more)return; busy=true;
 try{
  var r=await fetch('/api/posts?page='+page+'&q='+encodeURIComponent(q));
  var d=await r.json();
  if(reset)list.innerHTML='';
  list.insertAdjacentHTML('beforeend',d.posts.map(card).join(''));
  more=d.more; page++;
  if(!d.posts.length&&reset)list.innerHTML='<div class="empty">Koi post nahi mila</div>';
 }catch(e){}
 busy=false;
}
new IntersectionObserver(function(e){if(e[0].isIntersecting)load(false);},{rootMargin:'600px'}).observe(document.getElementById('end'));
var tm;document.getElementById('q').addEventListener('input',function(e){clearTimeout(tm);tm=setTimeout(function(){q=e.target.value.trim();load(true);},350);});
list.addEventListener('click',function(e){
 var b=e.target.closest('.sh'); if(!b)return;
 var u=location.origin+'/p/'+b.dataset.id;
 if(navigator.share){navigator.share({title:b.dataset.t,url:u}).catch(function(){});}
 else if(navigator.clipboard){navigator.clipboard.writeText(u);alert('Link copy ho gaya');}
});
function popup(){
 if(C.popup_on!=='1')return;
 var force=location.search.indexOf('pp=1')>-1;
 var fr=parseFloat(C.popup_freq)||0,last=0;
 try{last=+localStorage.getItem('pp_t')||0}catch(e){}
 if(!force&&fr>0&&Date.now()-last<fr*3600000)return;
 setTimeout(function(){
  var o=document.createElement('div');o.className='ov';
  o.innerHTML='<div class="pp"><button class="x" aria-label="Close">&times;</button>'+(C.popup_img?'<img src="'+esc(C.popup_img)+'" alt="">':'')+'<div class="b"><h3>'+esc(C.popup_title)+'</h3><p>'+esc(C.popup_text)+'</p><a class="btn full" id="ppj" href="'+esc(C.popup_link)+'" target="_blank" rel="noopener">'+esc(C.popup_btn)+'</a><button class="later" id="ppl">Baad mein</button></div></div>';
  document.body.appendChild(o);
  function close(){try{localStorage.setItem('pp_t',String(Date.now()))}catch(e){} o.remove();}
  o.querySelector('.x').onclick=close;
  document.getElementById('ppl').onclick=close;
  o.addEventListener('click',function(e){if(e.target===o)close();});
  document.getElementById('ppj').onclick=function(){try{navigator.sendBeacon('/api/ev',new Blob([JSON.stringify({n:'tg_join'})],{type:'application/json'}))}catch(e){} setTimeout(close,300);};
 },(parseFloat(C.popup_delay)||0)*1000);
}
load(true);
popup();
`;

const GO_JS = String.raw`
var el=document.getElementById('n'),n=parseInt(el.dataset.s)||5,a=document.getElementById('go'),u=a.href,done=false;
function beacon(){try{navigator.sendBeacon('/api/ev',new Blob([JSON.stringify({n:'go_tg'})],{type:'application/json'}))}catch(e){}}
var t=setInterval(function(){n--;el.textContent=n;if(n<=0){clearInterval(t);if(!done){done=true;beacon();}location.href=u;}},1000);
a.addEventListener('click',function(){if(!done){done=true;beacon();}});
`;

const ADMIN_JS = String.raw`
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var posts=[],days=7;
var NAMES={instagram:'Instagram',telegram:'Telegram',facebook:'Facebook',youtube:'YouTube',google:'Google',twitter:'X / Twitter',whatsapp:'WhatsApp',direct:'Direct / Unknown',search:'Search'};
var ICON={instagram:'&#128248; ',telegram:'&#9992;&#65039; ',facebook:'&#128101; ',youtube:'&#9654;&#65039; ',google:'&#128269; ',direct:'&#128279; ',whatsapp:'&#128172; '};
function show(ok){$('login').style.display=ok?'none':'flex';$('app').style.display=ok?'block':'none';}
async function api(u,m,b){
 var r=await fetch(u,{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
 if(r.status===401){show(false);throw new Error('auth');}
 return r.json();
}
async function login(){
 var r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('pw').value})});
 if(r.ok){$('pw').value='';$('msg').textContent='';start();}else{$('msg').textContent='Galat password';}
}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});show(false);}
function tab(n){
 ['dash','posts','popup','set'].forEach(function(t){$('t_'+t).style.display=t===n?'block':'none';});
 var bs=document.querySelectorAll('.tabs button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].dataset.t===n);
 if(n==='dash')loadStats();
}
function stat(v,l){return '<div class="st"><b>'+v+'</b><span>'+l+'</span></div>';}
function cname(c){if(c==='??')return 'Unknown';try{return new Intl.DisplayNames(['en'],{type:'region'}).of(c)}catch(e){return c}}
function lst(a,f){
 var mx=1;a.forEach(function(x){if(x.c>mx)mx=x.c});
 return a.length?a.map(function(x){return '<div class="li"><div class="lt"><span>'+f(x.k)+'</span><b>'+x.c+'</b></div><div class="lb"><i style="width:'+Math.round(x.c/mx*100)+'%"></i></div></div>';}).join(''):'<p class="mu">Abhi data nahi hai</p>';
}
function chart(a){
 var mx=1;a.forEach(function(x){if(x.v>mx)mx=x.v});
 var lab=a.length<=14;
 return '<div class="bars">'+a.map(function(x){return '<div class="bar" title="'+x.day+': '+x.v+' visitors, '+x.h+' views"><i style="height:'+Math.round(x.v/mx*100)+'%"></i><small>'+(lab?x.day.slice(8):'')+'</small></div>';}).join('')+'</div>';
}
async function loadStats(d){
 if(d)days=d;
 var bs=$('rg').querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',+bs[i].dataset.d===days);
 var s=await api('/api/admin/stats?days='+days);
 var ev={};s.events.forEach(function(x){ev[x.k]=x.c});
 var h='<div class="stats">'+stat(s.today.v,'Aaj ke visitors')+stat(s.active,'Abhi active (30 min)')+stat(s.range.u,'Unique visitors ('+days+' din)')+stat(s.range.h,'Page views ('+days+' din)')+'</div>';
 h+='<div class="stats">'+stat(s.clicks,'Post clicks ('+days+' din)')+stat(ev.tg_join||0,'Popup se Telegram clicks')+stat(ev.go_open||0,'Loading page opens')+stat(ev.go_tg||0,'Loading page se Telegram')+'</div>';
 h+='<div class="box"><h2>Daily visitors</h2>'+chart(s.daily)+'</div>';
 h+='<div class="two"><div class="box"><h2>Traffic kahan se aa raha hai</h2>'+lst(s.sources,function(k){return (ICON[k]||'&#127760; ')+esc(NAMES[k]||k);})+'</div>';
 h+='<div class="box"><h2>Top posts ('+days+' din)</h2>'+lst(s.tops.map(function(x){return {k:'#'+x.id+' '+x.title,c:x.c};}),esc)+'</div></div>';
 h+='<div class="two"><div class="box"><h2>Country</h2>'+lst(s.countries,function(k){return esc(cname(k));})+'</div>';
 h+='<div class="box"><h2>City</h2>'+lst(s.cities,esc)+'</div></div>';
 h+='<div class="box"><h2>Device</h2>'+lst(s.devices,function(k){return k==='mobile'?'&#128241; Mobile':'&#128187; Desktop';})+'</div>';
 h+='<p class="mu" style="font-size:12px">Visitor = ek alag device/browser (bots filter hote hain). Post view = ek visitor ka ek post par din mein 1 baar.</p>';
 $('dash').innerHTML=h;
}
async function loadPosts(){
 var d=await api('/api/admin/posts');posts=d.posts;
 $('pc').textContent='('+posts.length+')';
 $('items').innerHTML=posts.map(function(p){
  return '<div class="pi">'+(p.thumb?'<img src="'+esc(p.thumb)+'" alt="">':'<div class="nt"></div>')+'<div class="in"><b>#'+p.id+' '+esc(p.title)+'</b><span class="mu">&#128065; '+p.views+(p.duration?' &middot; '+esc(p.duration):'')+'</span></div><button onclick="edit('+p.id+')">Edit</button><button onclick="del('+p.id+')">&#128465;</button></div>';
 }).join('')||'<p class="mu">Abhi koi post nahi</p>';
}
function edit(id){
 var p=posts.filter(function(x){return x.id===id})[0];
 $('f_id').value=id;$('f_title').value=p.title;$('f_thumb').value=p.thumb||'';$('f_link').value=p.link||'';$('f_dur').value=p.duration||'';
 $('formh').textContent='Post #'+id+' edit karo';window.scrollTo(0,0);
}
function clearf(){['f_id','f_title','f_thumb','f_link','f_dur'].forEach(function(i){$(i).value='';});$('formh').textContent='Naya Post';}
async function savePost(){
 var b={title:$('f_title').value,thumb:$('f_thumb').value,link:$('f_link').value,duration:$('f_dur').value};
 var id=$('f_id').value;
 var r=id?await api('/api/admin/posts/'+id,'PUT',b):await api('/api/admin/posts','POST',b);
 if(r.error){alert(r.error);return;}
 clearf();loadPosts();
}
async function del(id){if(!confirm('Post #'+id+' delete karein?'))return;await api('/api/admin/posts/'+id,'DELETE');loadPosts();}
function collect(){var b={};document.querySelectorAll('[data-k]').forEach(function(e){b[e.dataset.k]=e.value});return b;}
async function loadSettings(){
 var s=await api('/api/admin/settings');
 document.querySelectorAll('[data-k]').forEach(function(e){if(s[e.dataset.k]!==undefined)e.value=s[e.dataset.k];});
}
async function saveS(){
 var b=collect();
 var r=await api('/api/admin/settings','POST',b);
 if(r.error){alert(r.error);return;}
 document.documentElement.style.setProperty('--ac',b.accent);
 alert('Save ho gaya');
}
async function resetData(w){if(!confirm('Pakka? Ye wapas nahi aayega.'))return;await api('/api/admin/reset','POST',{what:w});alert('Ho gaya');loadStats();loadPosts();}
var PRE=['#6c5ce7','#29a9eb','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
function start(){
 show(true);loadStats();loadPosts();loadSettings();
 $('sw').innerHTML=PRE.map(function(c){return '<button style="background:'+c+'" onclick="document.querySelector(&quot;[data-k=accent]&quot;).value=&quot;'+c+'&quot;"></button>';}).join('');
 $('l1').textContent=location.origin+'/';$('l2').textContent=location.origin+'/go';$('l3').textContent=location.origin+'/?src=instagram';
}
$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
fetch('/api/admin/posts').then(function(r){if(r.ok)start();else show(false);});
`;

// ---------- pages ----------
function feedPage(s) {
  const cfg = {
    popup_on: s.popup_on, popup_title: s.popup_title, popup_text: s.popup_text, popup_img: s.popup_img,
    popup_btn: s.popup_btn, popup_link: s.popup_link || s.telegram_url, popup_delay: s.popup_delay, popup_freq: s.popup_freq,
  };
  const logo = s.logo_url ? '<img src="' + esc(s.logo_url) + '" alt="">' : esc((s.site_name || 'M').charAt(0).toUpperCase());
  const sk = '<div class="sk"></div>'.repeat(6);
  const body =
    '<header class="hd"><div class="wrap hdin"><a class="brand" href="/"><span class="lg">' + logo + '</span><span>' + esc(s.site_name) + '</span></a>' +
    '<div class="sw"><input id="q" class="search" type="search" placeholder="Search posts..."><button id="tt" class="ib" aria-label="Theme">&#9680;</button></div></div></header>' +
    '<section class="wrap hero"><div class="hb"><h1>' + esc(s.site_name) + '</h1><p>' + esc(s.tagline) + '</p></div></section>' +
    '<main class="wrap sec"><h2>Latest Posts</h2><div id="list" class="grid">' + sk + '</div><div id="end" style="height:1px"></div></main>' +
    '<footer>&copy; ' + new Date().getFullYear() + ' ' + esc(s.site_name) + '</footer>';
  const head = '<meta name="description" content="' + esc(s.tagline) + '"><meta property="og:title" content="' + esc(s.site_name) + '"><meta property="og:description" content="' + esc(s.tagline) + '">' +
    '<script>window.CFG=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + '</script>';
  return html(layout(s, s.site_name, body, head, TT_JS + FEED_JS), 200, { 'Cache-Control': 'no-store' });
}

function goPage(s, target) {
  const sec = Math.min(Math.max(parseInt(s.countdown) || 5, 1), 30);
  const body =
    '<div class="center"><div class="ring"><span id="n" data-s="' + sec + '">' + sec + '</span></div><h2>Aapko redirect kiya ja raha hai...</h2>' +
    '<p class="mu">Agar apne aap na khule to neeche button dabayein</p><a id="go" class="btn" href="' + esc(target) + '">Telegram Kholo</a></div>';
  return html(layout(s, 'Redirecting...', body, '<meta name="robots" content="noindex">', GO_JS), 200, { 'Cache-Control': 'no-store' });
}

function adminPage(s) {
  const body =
    '<div id="login" class="center" style="display:none"><div class="box fm" style="width:100%;max-width:340px"><h2>Admin Login</h2><input id="pw" type="password" placeholder="Password"><div class="btns"><button class="btn full" onclick="login()">Login</button></div><p id="msg" style="color:#e5484d;margin-top:10px"></p></div></div>' +
    '<div id="app" style="display:none">' +
    '<header class="hd"><div class="wrap hdin"><b style="font-size:18px">&#9881; Admin Panel</b><div class="sw"><button id="tt" class="ib" aria-label="Theme">&#9680;</button><a class="ib" href="/" target="_blank" style="display:flex;align-items:center;justify-content:center">&#127968;</a><button class="ib" onclick="logout()" aria-label="Logout">&#10162;</button></div></div></header>' +
    '<nav class="tabs"><button data-t="dash" class="on" onclick="tab(\'dash\')">&#128202; Dashboard</button><button data-t="posts" onclick="tab(\'posts\')">&#128221; Posts</button><button data-t="popup" onclick="tab(\'popup\')">&#128276; Popup</button><button data-t="set" onclick="tab(\'set\')">&#127912; Settings</button></nav>' +
    '<main class="wrap" style="padding-top:8px;padding-bottom:50px">' +
    // dashboard
    '<section id="t_dash"><div class="rg" id="rg"><button data-d="7" class="on" onclick="loadStats(7)">7 din</button><button data-d="30" onclick="loadStats(30)">30 din</button><button data-d="90" onclick="loadStats(90)">90 din</button></div><div id="dash"><p class="mu">Loading...</p></div></section>' +
    // posts
    '<section id="t_posts" style="display:none;margin-top:14px"><div class="box fm"><h2 id="formh">Naya Post</h2><input type="hidden" id="f_id"><label>Title</label><input id="f_title"><label>Thumbnail image URL</label><input id="f_thumb" placeholder="https://..."><label>Post link (post par click karte hi seedha yahi khulega)</label><input id="f_link" placeholder="https://..."><label>Duration (optional, jaise 15:14)</label><input id="f_dur"><div class="btns"><button class="btn" onclick="savePost()">Save Post</button><button class="btn g" onclick="clearf()">Clear</button></div></div><div class="box"><h2>Saare Posts <span id="pc" class="mu"></span></h2><div id="items"></div></div></section>' +
    // popup
    '<section id="t_popup" style="display:none;margin-top:14px"><div class="box fm"><h2>Telegram Join Popup</h2><label>Popup status</label><select data-k="popup_on"><option value="1">ON (website khulte hi dikhega)</option><option value="0">OFF</option></select><label>Title</label><input data-k="popup_title"><label>Text</label><textarea data-k="popup_text" rows="3"></textarea><label>Image URL (optional)</label><input data-k="popup_img" placeholder="https://..."><label>Button text</label><input data-k="popup_btn"><label>Telegram channel link (khali = Settings wala link)</label><input data-k="popup_link" placeholder="https://t.me/..."><label>Kitne second baad dikhe</label><input data-k="popup_delay" type="number" min="0" max="60"><label>Dobara kitne ghante baad dikhe (0 = har baar)</label><input data-k="popup_freq" type="number" min="0" max="720"><div class="btns"><button class="btn" onclick="saveS()">Save Popup</button><a class="btn g" href="/?pp=1" target="_blank">Preview</a></div></div></section>' +
    // settings
    '<section id="t_set" style="display:none;margin-top:14px"><div class="box fm"><h2>Site &amp; Theme</h2><label>Site ka naam</label><input data-k="site_name"><label>Tagline</label><input data-k="tagline"><label>Logo image URL (optional)</label><input data-k="logo_url" placeholder="https://..."><label>Default theme</label><select data-k="theme_default"><option value="dark">Dark</option><option value="light">Light</option><option value="auto">Auto (phone ke hisaab se)</option></select><label>Theme colour</label><input type="color" data-k="accent"><div class="sw2" id="sw"></div><label>Telegram channel link</label><input data-k="telegram_url" placeholder="https://t.me/..."><label>Loading page countdown (seconds)</label><input data-k="countdown" type="number" min="1" max="30"><div class="btns"><button class="btn" onclick="saveS()">Save Settings</button></div></div>' +
    '<div class="box"><h2>Important Links</h2><p class="mu" style="font-size:13px;margin-bottom:6px">Website</p><code id="l1"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Instagram bio link (loading page, phir Telegram)</p><code id="l2"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Instagram se home page par traffic (tracking ke liye)</p><code id="l3"></code></div>' +
    '<div class="box"><h2>Data Reset</h2><div class="btns"><button class="btn g" onclick="resetData(\'views\')">Post views 0 karo</button><button class="btn r" onclick="resetData(\'stats\')">Analytics clear karo</button></div></div></section>' +
    '</main></div>';
  return html(layout(s, 'Admin', body, '<meta name="robots" content="noindex,nofollow">', TT_JS + ADMIN_JS), 200, { 'Cache-Control': 'no-store' });
}

// ---------- main ----------
export default {
  async fetch(req, env, ctx) {
    if (!env.DB) return new Response('D1 binding "DB" missing', { status: 500 });
    await init(env);
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    const ua = req.headers.get('User-Agent') || '';

    try {
      // Home
      if (path === '/' && method === 'GET') {
        ctx.waitUntil(trackVisit(req, env, url).catch(() => {}));
        return feedPage(await getSettings(env));
      }

      // Feed API
      if (path === '/api/posts' && method === 'GET') {
        const pg = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
        const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
        const lim = 12, off = (pg - 1) * lim;
        const st = q
          ? env.DB.prepare('SELECT id,title,thumb,duration,views,created_at FROM posts WHERE title LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?').bind('%' + q + '%', lim, off)
          : env.DB.prepare('SELECT id,title,thumb,duration,views,created_at FROM posts ORDER BY id DESC LIMIT ? OFFSET ?').bind(lim, off);
        const { results } = await st.all();
        return json({ posts: results, more: results.length === lim }, 200, { 'Cache-Control': 'public, max-age=20' });
      }

      // Post click -> direct redirect to the added link
      let m = path.match(/^\/p\/(\d+)$/);
      if (m && method === 'GET') {
        const p = await env.DB.prepare('SELECT id,link FROM posts WHERE id=?').bind(+m[1]).first();
        if (!p) return new Response(null, { status: 302, headers: { Location: '/' } });
        let target = p.link && okUrl(p.link) ? p.link : (await getSettings(env)).telegram_url;
        if (!isBot(ua)) ctx.waitUntil(vidOf(req, env).then((v) => countPostView(env, p.id, v)).catch(() => {}));
        return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
      }

      // Loading / redirect page (Instagram bio -> /go)
      if (path === '/go' && method === 'GET') {
        const s = await getSettings(env);
        let target = s.telegram_url;
        const id = parseInt(url.searchParams.get('id'));
        if (id) {
          const p = await env.DB.prepare('SELECT link FROM posts WHERE id=?').bind(id).first();
          if (p && p.link && okUrl(p.link)) target = p.link;
        }
        if (!isBot(ua)) {
          ctx.waitUntil(trackVisit(req, env, url).catch(() => {}));
          ctx.waitUntil(bump(env, 'go_open').catch(() => {}));
        }
        return goPage(s, target);
      }

      // Event beacons
      if (path === '/api/ev' && method === 'POST') {
        if (!isBot(ua)) {
          const b = await req.json().catch(() => ({}));
          if (['tg_join', 'go_tg'].includes(b.n)) ctx.waitUntil(bump(env, b.n).catch(() => {}));
        }
        return new Response(null, { status: 204 });
      }

      // Admin
      if (path === '/admin' && method === 'GET') return adminPage(await getSettings(env));

      if (path === '/api/admin/login' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && env.SESSION_SECRET && b.password === env.ADMIN_PASSWORD) {
          const tok = await makeToken(env);
          return json({ ok: true }, 200, { 'Set-Cookie': 'adm=' + tok + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800' });
        }
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: 'bad password' }, 401);
      }
      if (path === '/api/admin/logout' && method === 'POST')
        return json({ ok: true }, 200, { 'Set-Cookie': 'adm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });

      if (path.startsWith('/api/admin/')) {
        if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);

        if (path === '/api/admin/stats' && method === 'GET') return json(await stats(env, parseInt(url.searchParams.get('days'))));

        if (path === '/api/admin/posts' && method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT 500').all();
          return json({ posts: results });
        }
        if (path === '/api/admin/posts' && method === 'POST') {
          const b = await req.json();
          const title = String(b.title || '').trim().slice(0, 200);
          if (!title) return json({ error: 'Title zaroori hai' });
          if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URL http:// ya https:// se shuru hona chahiye' });
          await env.DB.prepare('INSERT INTO posts (title,thumb,link,duration,views,created_at) VALUES (?,?,?,?,0,?)')
            .bind(title, b.thumb || '', b.link || '', String(b.duration || '').slice(0, 12), Date.now()).run();
          return json({ ok: true });
        }
        m = path.match(/^\/api\/admin\/posts\/(\d+)$/);
        if (m && method === 'PUT') {
          const b = await req.json();
          const title = String(b.title || '').trim().slice(0, 200);
          if (!title) return json({ error: 'Title zaroori hai' });
          if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URL http:// ya https:// se shuru hona chahiye' });
          await env.DB.prepare('UPDATE posts SET title=?,thumb=?,link=?,duration=? WHERE id=?')
            .bind(title, b.thumb || '', b.link || '', String(b.duration || '').slice(0, 12), +m[1]).run();
          return json({ ok: true });
        }
        if (m && method === 'DELETE') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM posts WHERE id=?').bind(+m[1]),
            env.DB.prepare('DELETE FROM post_views WHERE post_id=?').bind(+m[1]),
          ]);
          return json({ ok: true });
        }

        if (path === '/api/admin/settings' && method === 'GET') return json(await getSettings(env));
        if (path === '/api/admin/settings' && method === 'POST') {
          const b = await req.json();
          const out = {};
          for (const k of Object.keys(DEF)) {
            if (b[k] === undefined) continue;
            let v = String(b[k]).trim().slice(0, 400);
            if (URLK.includes(k) && !okUrl(v)) return json({ error: k + ' ka link http:// ya https:// se shuru hona chahiye' });
            if (k === 'accent' && !/^#[0-9a-f]{6}$/i.test(v)) return json({ error: 'Colour galat hai' });
            if (k === 'theme_default' && !['dark', 'light', 'auto'].includes(v)) v = 'dark';
            if (k === 'popup_on') v = v === '0' ? '0' : '1';
            if (k === 'countdown') v = String(Math.min(Math.max(parseInt(v) || 5, 1), 30));
            if (k === 'popup_delay') v = String(Math.min(Math.max(parseInt(v) || 0, 0), 60));
            if (k === 'popup_freq') v = String(Math.min(Math.max(parseFloat(v) || 0, 0), 720));
            if (k === 'site_name' && !v) v = DEF.site_name;
            out[k] = v;
          }
          const sts = Object.entries(out).map(([k, v]) =>
            env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, v));
          if (sts.length) await env.DB.batch(sts);
          return json({ ok: true });
        }

        if (path === '/api/admin/reset' && method === 'POST') {
          const b = await req.json();
          if (b.what === 'views') await env.DB.batch([env.DB.prepare('UPDATE posts SET views=0'), env.DB.prepare('DELETE FROM post_views')]);
          else if (b.what === 'stats') await env.DB.batch([env.DB.prepare('DELETE FROM visits'), env.DB.prepare('DELETE FROM events')]);
          return json({ ok: true });
        }
      }

      return new Response(null, { status: 302, headers: { Location: '/' } });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
