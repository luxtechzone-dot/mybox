// ============================================================
// Link-Page Builder (Linktree style) - Cloudflare Pages / Workers + D1
// Home = your customisable page | /admin = drag & drop builder
// /terms /privacy auto pages | 18+ age gate | link-click analytics
// Bindings: D1 -> DB | Secrets: ADMIN_PASSWORD, SESSION_SECRET
// ============================================================

const enc = new TextEncoder();
let ready = false;
let cache = { t: 0, v: null };

const IST = 19800000;
const dayStr = (off = 0) => new Date(Date.now() + IST - off * 864e5).toISOString().slice(0, 10);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (b, status = 200, h = {}) => new Response(b, { status, headers: { 'Content-Type': 'text/html;charset=utf-8', ...h } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const okUrl = (u) => !u || /^https?:\/\/[^\s]+$/i.test(u);
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

// ---------- default page + sanitiser ----------
const DP = {
  site: 'My Page', title: 'My Page', bio: 'Welcome! Neeche diye links se judo.', avatar: '',
  bg: { type: 'gradient', c1: '#1e1b4b', c2: '#6c5ce7', angle: 160, img: '', ov: 0.35 },
  tx: '#ffffff', font: 'sans',
  btn: { style: 'grad', c1: '#6c5ce7', c2: '#ec4899', tc: '#ffffff', r: 16 },
  age: { on: true, title: '18+ Website Alert', text: 'Ye page sirf 18 saal ya usse zyada umar ke logon ke liye hai. Kya aapki umar 18+ hai?', yes: 'Yes, I am 18+', no: 'No' },
  contact: '', links: [],
};
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const str = (v, n, d = '') => (typeof v === 'string' ? v.trim().slice(0, n) : d);
const num = (v, a, b, d) => { v = parseFloat(v); return isNaN(v) ? d : Math.min(Math.max(v, a), b); };
const url = (v) => { v = str(v, 500); return okUrl(v) ? v : ''; };

function clean(c) {
  c = c || {};
  const b = c.bg || {}, k = c.btn || {}, a = c.age || {};
  return {
    site: str(c.site, 60, DP.site) || DP.site, title: str(c.title, 80, DP.title), bio: str(c.bio, 300), avatar: url(c.avatar),
    bg: { type: ['color', 'gradient', 'image'].includes(b.type) ? b.type : 'gradient', c1: col(b.c1, DP.bg.c1), c2: col(b.c2, DP.bg.c2), angle: num(b.angle, 0, 360, 160), img: url(b.img), ov: num(b.ov, 0, 0.9, 0.3) },
    tx: col(c.tx, '#ffffff'), font: ['sans', 'serif', 'mono', 'round'].includes(c.font) ? c.font : 'sans',
    btn: { style: ['fill', 'outline', 'glass', 'grad'].includes(k.style) ? k.style : 'grad', c1: col(k.c1, DP.btn.c1), c2: col(k.c2, DP.btn.c2), tc: col(k.tc, '#ffffff'), r: num(k.r, 0, 40, 16) },
    age: { on: !!a.on, title: str(a.title, 80, DP.age.title), text: str(a.text, 300, DP.age.text), yes: str(a.yes, 30, DP.age.yes), no: str(a.no, 30, DP.age.no) },
    contact: str(c.contact, 100),
    links: (Array.isArray(c.links) ? c.links : []).slice(0, 60)
      .map((l) => ({ id: /^[a-z0-9]{4,12}$/i.test(l.id || '') ? l.id : rid(), label: str(l.label, 80, 'Link') || 'Link', url: url(l.url), icon: url(l.icon), pr: !!l.pr }))
      .filter((l) => l.url),
  };
}

async function init(env) {
  if (ready) return;
  const d = env.DB;
  await d.batch([
    d.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    d.prepare('CREATE TABLE IF NOT EXISTS visits (day TEXT, vid TEXT, src TEXT, country TEXT, city TEXT, device TEXT, hits INTEGER DEFAULT 1, ts INTEGER, PRIMARY KEY (day, vid))'),
    d.prepare('CREATE TABLE IF NOT EXISTS lclicks (day TEXT, lid TEXT, c INTEGER DEFAULT 0, PRIMARY KEY (day, lid))'),
    d.prepare('CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day)'),
  ]);
  ready = true;
}

async function getPage(env) {
  if (cache.v && Date.now() - cache.t < 15000) return cache.v;
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k='page'").first();
  let c = {};
  try { c = r ? JSON.parse(r.v) : {}; } catch (e) {}
  const v = clean({ ...DP, ...c, bg: { ...DP.bg, ...(c.bg || {}) }, btn: { ...DP.btn, ...(c.btn || {}) }, age: { ...DP.age, ...(c.age || {}) } });
  cache = { t: Date.now(), v };
  return v;
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

async function stats(env, days) {
  days = Math.min(Math.max(days || 7, 1), 90);
  const from = dayStr(days - 1), d = env.DB;
  const [daily, srcs, ctry, dev, lk, tot, act] = await d.batch([
    d.prepare('SELECT day, COUNT(*) v, SUM(hits) h FROM visits WHERE day>=? GROUP BY day').bind(from),
    d.prepare('SELECT src k, COUNT(*) c FROM visits WHERE day>=? GROUP BY src ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare('SELECT country k, COUNT(*) c FROM visits WHERE day>=? GROUP BY country ORDER BY c DESC LIMIT 10').bind(from),
    d.prepare('SELECT device k, COUNT(*) c FROM visits WHERE day>=? GROUP BY device ORDER BY c DESC').bind(from),
    d.prepare('SELECT lid k, SUM(c) c FROM lclicks WHERE day>=? GROUP BY lid ORDER BY c DESC LIMIT 20').bind(from),
    d.prepare('SELECT COUNT(DISTINCT vid) u, COALESCE(SUM(hits),0) h FROM visits WHERE day>=?').bind(from),
    d.prepare('SELECT COUNT(*) a FROM visits WHERE ts>?').bind(Date.now() - 30 * 60 * 1000),
  ]);
  const map = {};
  daily.results.forEach((r) => (map[r.day] = r));
  const filled = [];
  for (let i = days - 1; i >= 0; i--) { const k = dayStr(i), r = map[k]; filled.push({ day: k, v: r ? r.v : 0, h: r ? r.h : 0 }); }
  return { daily: filled, today: filled[filled.length - 1], sources: srcs.results, countries: ctry.results, devices: dev.results, links: lk.results, range: tot.results[0], active: act.results[0].a };
}

// ---------- CSS ----------
const BASE = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1115;color:#eef1f6;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.45;-webkit-tap-highlight-color:transparent}
a{color:inherit;text-decoration:none}
.btn{display:inline-block;background:linear-gradient(135deg,#6c5ce7,#4f46e5);color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;text-align:center}
.btn.g{background:#232a35;color:#eef1f6}.btn.r{background:#e5484d}.btn.full{display:block;width:100%}.btn.sm{padding:8px 14px;font-size:14px}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px;z-index:99}
.pp{background:#1a1f27;color:#eef1f6;border-radius:22px;max-width:380px;width:100%;padding:24px;text-align:center}
.pp h3{font-size:20px;margin:10px 0 8px}.pp p{color:#aab2c0;font-size:14px;margin-bottom:18px}
.w18{width:70px;height:70px;border-radius:50%;background:#e5484d;color:#fff;font-weight:800;font-size:24px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.pg{position:relative;min-height:100vh;display:flex;justify-content:center;overflow:hidden}
.pg .ovl{position:absolute;inset:0}
.pg .in{position:relative;width:100%;max-width:520px;padding:44px 18px 40px;text-align:center}
.av{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.6);margin-bottom:14px}
.pg h1{font-size:24px;margin-bottom:6px}
.bio{opacity:.9;margin-bottom:22px;font-size:15px;white-space:pre-line}
.lk{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;margin:0 0 12px;border-radius:var(--br);font-weight:600;position:relative;overflow:hidden;transition:transform .15s}
.lk:active{transform:scale(.98)}
.lk span{flex:1;text-align:center}
.lk img{width:40px;height:40px;border-radius:calc(var(--br) * .6);object-fit:cover}
.bs-fill .lk{background:var(--b1);color:var(--bt)}
.bs-outline .lk{border:2px solid var(--b1);color:var(--b1);background:transparent}
.bs-glass .lk{background:rgba(255,255,255,.18);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3);color:var(--bt)}
.bs-grad .lk{background:linear-gradient(135deg,var(--b1),var(--b2));color:var(--bt)}
.lk.pr{background:linear-gradient(120deg,var(--b1),var(--b2),var(--b1));background-size:200% 100%;color:var(--bt);border:0;animation:mv 3s linear infinite;box-shadow:0 0 18px color-mix(in srgb,var(--b1) 60%,transparent)}
.lk.pr::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:shn 2.4s infinite}
@keyframes mv{to{background-position:-200% 0}}
@keyframes shn{to{left:130%}}
.ft{margin-top:26px;font-size:12px;opacity:.75}
.doc{max-width:760px;margin:0 auto;padding:30px 18px 60px}
.doc h1{font-size:28px;margin-bottom:6px}.doc h2{font-size:18px;margin:24px 0 8px}
.doc p,.doc li{color:#c8cfdb;font-size:15px;margin-bottom:8px}.doc ul{padding-left:20px}.doc .mu{color:#8b94a3;font-size:13px}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:#1a1f27;border:1px solid #262c36;border-radius:16px;padding:16px;margin-bottom:16px}
.box h2{font-size:17px;margin-bottom:10px}
.mu{color:#8b94a3}
.fm label{display:block;font-size:13px;color:#8b94a3;margin:10px 0 4px}
.fm input:not([type=checkbox]):not([type=range]),.fm select,.fm textarea{width:100%;background:#0f1115;border:1px solid #262c36;border-radius:10px;padding:11px;color:#eef1f6;font-size:15px;outline:none;font-family:inherit}
.fm input[type=color]{height:44px;padding:3px}
.fm input[type=range]{width:100%}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.hd{position:sticky;top:0;z-index:20;background:rgba(15,17,21,.92);backdrop-filter:blur(10px);border-bottom:1px solid #262c36;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px}
.hr{display:flex;gap:8px}
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
.ck{font-size:13px;color:#aab2c0;display:flex;gap:6px;align-items:center}
.x2{background:#2a1215;color:#ff6b6b;border:0;border-radius:8px;width:34px;height:34px;cursor:pointer}
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
  '<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' + (head || '') + '<style>' + BASE + '</style></head><body>' + body + (script ? '<script>' + script + '</script>' : '') + '</body></html>';

// ---------- client scripts (String.raw: no backticks / no dollar-brace) ----------
const RENDER_JS = String.raw`
var FONTS={sans:'Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'ui-monospace,Menlo,Consolas,monospace',round:'"Trebuchet MS","Segoe UI",system-ui,sans-serif'};
function E(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function R(c,root,pv){
 var b=c.bg,s=root.style,k=c.btn;
 if(b.type==='color')s.background=b.c1;
 else if(b.type==='gradient')s.background='linear-gradient('+b.angle+'deg,'+b.c1+','+b.c2+')';
 else{s.background=b.c1;if(b.img){s.backgroundImage='url("'+b.img.replace(/"/g,'%22')+'")';s.backgroundSize='cover';s.backgroundPosition='center';}}
 s.setProperty('--b1',k.c1);s.setProperty('--b2',k.c2);s.setProperty('--bt',k.tc);s.setProperty('--br',k.r+'px');
 s.fontFamily=FONTS[c.font]||FONTS.sans;s.color=c.tx;
 root.className='pg bs-'+k.style;
 var h=(b.type==='image'&&b.img?'<div class="ovl" style="background:rgba(0,0,0,'+b.ov+')"></div>':'')+'<div class="in">';
 if(c.avatar)h+='<img class="av" src="'+E(c.avatar)+'" alt="">';
 h+='<h1>'+E(c.title)+'</h1>'+(c.bio?'<p class="bio">'+E(c.bio)+'</p>':'');
 c.links.forEach(function(l){h+='<a class="lk'+(l.pr?' pr':'')+'" href="'+(pv?'#':'/l/'+l.id)+'">'+(l.icon?'<img src="'+E(l.icon)+'" alt="" loading="lazy">':'')+'<span>'+E(l.label)+'</span></a>';});
 h+='<div class="ft"><a href="'+(pv?'#':'/terms')+'">Terms &amp; Conditions</a> &middot; <a href="'+(pv?'#':'/privacy')+'">Privacy Policy</a></div></div>';
 root.innerHTML=h;
}
`;

const PUBLIC_JS = String.raw`
var c=window.CFG;
R(c,document.getElementById('pg'),false);
if(c.age.on){
 var ok=false;try{ok=localStorage.getItem('a18')==='1'}catch(e){}
 if(!ok){
  var o=document.createElement('div');o.className='ov';
  o.innerHTML='<div class="pp"><div class="w18">18+</div><h3>'+E(c.age.title)+'</h3><p>'+E(c.age.text)+'</p><button class="btn full" id="ay">'+E(c.age.yes)+'</button><button class="btn g full" id="an" style="margin-top:10px">'+E(c.age.no)+'</button></div>';
  document.body.appendChild(o);
  document.getElementById('ay').onclick=function(){try{localStorage.setItem('a18','1')}catch(e){}o.remove();};
  document.getElementById('an').onclick=function(){location.href='https://www.google.com';};
 }
}
`;

const ADMIN_JS = String.raw`
function $(i){return document.getElementById(i)}
var cfg=null,days=7,drag=null;
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
 if(r.ok){$('pw').value='';$('msg').textContent='';start();}else{$('msg').textContent='Galat password';}
}
function tab(n){
 ['links','design','set','stats','pv'].forEach(function(t){$('t_'+t).classList.toggle('on',t===n);});
 var bs=document.querySelectorAll('.tabs button');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('on',bs[i].dataset.t===n);
 if(n==='stats')loadStats();
}
function draw(){R(cfg,$('pv'),true);}
function L(id){return cfg.links.filter(function(x){return x.id===id})[0];}
function buildLinks(){
 $('lks').innerHTML=cfg.links.map(function(l){
  return '<div class="row" data-id="'+l.id+'"><span class="hdl">&#8942;&#8942;</span><div class="f"><input class="fl" placeholder="Button text" value="'+E(l.label)+'"><input class="fu" placeholder="Link (https://t.me/...)" value="'+E(l.url)+'"><input class="fi" placeholder="Icon / image URL (optional)" value="'+E(l.icon)+'"><label class="ck"><input type="checkbox" class="fp"'+(l.pr?' checked':'')+'> Premium shine button</label></div><button class="x2" data-del="1">&#10005;</button></div>';
 }).join('')||'<p class="mu">Abhi koi link nahi. Neeche button se add karo.</p>';
}
function getp(o,p){return p.split('.').reduce(function(a,k){return a[k]},o);}
function setp(o,p,v){var a=p.split('.'),l=a.pop();a.reduce(function(x,k){return x[k]},o)[l]=v;}
function bind(){
 document.querySelectorAll('[data-p]').forEach(function(e){
  var v=getp(cfg,e.dataset.p);
  if(e.type==='checkbox')e.checked=!!v;else e.value=v;
  e.oninput=e.onchange=function(){
   var nv=e.type==='checkbox'?e.checked:(e.type==='range'?parseFloat(e.value):e.value);
   setp(cfg,e.dataset.p,nv);draw();
  };
 });
}
function applyTh(i){var t=TH[i];Object.assign(cfg.bg,t.bg);cfg.tx=t.tx;Object.assign(cfg.btn,t.btn);bind();draw();}
async function save(){
 var r=await api('/api/admin/page','POST',cfg);
 if(r.error){alert(r.error);return;}
 cfg=r.page;buildLinks();bind();draw();
 $('sbtn').textContent='Saved \u2713';setTimeout(function(){$('sbtn').textContent='Save';},1500);
}
function stat(v,l){return '<div class="st"><b>'+v+'</b><span>'+l+'</span></div>';}
function cname(c){if(c==='??')return 'Unknown';try{return new Intl.DisplayNames(['en'],{type:'region'}).of(c)}catch(e){return c}}
function lst(a,f){
 var mx=1;a.forEach(function(x){if(x.c>mx)mx=x.c});
 return a.length?a.map(function(x){return '<div class="li"><div class="lt"><span>'+f(x.k)+'</span><b>'+x.c+'</b></div><div class="lb"><i style="width:'+Math.round(x.c/mx*100)+'%"></i></div></div>';}).join(''):'<p class="mu">Abhi data nahi hai</p>';
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
 var h='<div class="stats">'+stat(s.today.v,'Aaj ke visitors')+stat(s.active,'Abhi active (30 min)')+stat(s.range.u,'Unique visitors ('+days+' din)')+stat(s.range.h,'Page views ('+days+' din)')+'</div>';
 h+='<div class="box"><h2>Daily visitors</h2>'+chart(s.daily)+'</div>';
 h+='<div class="two"><div class="box"><h2>Traffic kahan se</h2>'+lst(s.sources,function(k){return E(NAMES[k]||k);})+'</div><div class="box"><h2>Link clicks</h2>'+lst(s.links,function(k){return E(names[k]||'(deleted link)');})+'</div></div>';
 h+='<div class="two"><div class="box"><h2>Country</h2>'+lst(s.countries,function(k){return E(cname(k));})+'</div><div class="box"><h2>Device</h2>'+lst(s.devices,function(k){return k==='mobile'?'Mobile':'Desktop';})+'</div></div>';
 h+='<p class="mu" style="font-size:12px">Visitor = ek alag device/browser (bots filter hote hain). Country IP se aata hai, approximate hota hai.</p>';
 $('dash').innerHTML=h;
}
async function start(){
 show(true);
 var r=await api('/api/admin/page');cfg=r.page;
 buildLinks();bind();draw();
 $('ths').innerHTML=TH.map(function(t,i){return '<button class="thb" data-i="'+i+'" style="background:'+(t.bg.type==='gradient'?'linear-gradient('+t.bg.angle+'deg,'+t.bg.c1+','+t.bg.c2+')':t.bg.c1)+';color:'+t.tx+'">'+t.n+'</button>';}).join('');
 $('l1').textContent=location.origin+'/';$('l2').textContent=location.origin+'/?src=instagram';$('l3').textContent=location.origin+'/?src=telegram';
}
document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){tab(b.dataset.t);};});
document.querySelectorAll('#rg button').forEach(function(b){b.onclick=function(){loadStats(+b.dataset.d);};});
$('ths').addEventListener('click',function(e){var b=e.target.closest('.thb');if(b)applyTh(+b.dataset.i);});
$('addl').onclick=function(){cfg.links.push({id:Math.random().toString(36).slice(2,10),label:'New Link',url:'',icon:'',pr:false});buildLinks();draw();};
$('lks').addEventListener('input',function(e){
 var r=e.target.closest('.row');if(!r)return;var l=L(r.dataset.id),t=e.target.classList;
 if(t.contains('fl'))l.label=e.target.value;else if(t.contains('fu'))l.url=e.target.value;else if(t.contains('fi'))l.icon=e.target.value;else if(t.contains('fp'))l.pr=e.target.checked;
 draw();
});
$('lks').addEventListener('click',function(e){
 if(!e.target.dataset.del)return;var id=e.target.closest('.row').dataset.id;
 cfg.links=cfg.links.filter(function(x){return x.id!==id;});buildLinks();draw();
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
$('sbtn').onclick=save;
$('lo').onclick=async function(){await fetch('/api/admin/logout',{method:'POST'});show(false);};
$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login();});
$('lgn').onclick=login;
fetch('/api/admin/page').then(function(r){if(r.ok)start();else show(false);});
`;

// ---------- pages ----------
function publicPage(c) {
  const head = '<meta name="description" content="' + esc(c.bio) + '"><meta property="og:title" content="' + esc(c.title) + '"><meta property="og:description" content="' + esc(c.bio) + '">' +
    (c.avatar ? '<meta property="og:image" content="' + esc(c.avatar) + '">' : '') + '<script>window.CFG=' + safeJson(c) + '</script>';
  return html(shell(c.title, head, '<div id="pg" class="pg"></div>', RENDER_JS + PUBLIC_JS), 200, { 'Cache-Control': 'no-store' });
}

function legal(c, title, inner) {
  const body = '<div class="doc"><p class="mu"><a href="/">&larr; ' + esc(c.site) + '</a></p><h1>' + title + '</h1><p class="mu">Last updated: ' + dayStr() + '</p>' + inner + '</div>';
  return html(shell(title + ' - ' + c.site, '', body, ''), 200, { 'Cache-Control': 'public, max-age=300' });
}
function termsPage(c) {
  const n = esc(c.site), m = c.contact ? esc(c.contact) : 'site ke admin se Telegram/Instagram par sampark karein';
  return legal(c, 'Terms &amp; Conditions',
    '<h2>1. Manzoori</h2><p>Is page (' + n + ') ko use karke aap ye Terms maante hain. Agar aap sehmat nahi hain to kripya page use na karein.</p>' +
    '<h2>2. Umar (18+)</h2><p>Is page ke links aur unke peeche ka content sirf <b>18 saal ya usse zyada</b> umar ke logon ke liye hai. Agar aapki umar 18 se kam hai to is page se turant bahar nikal jayein. Age alert mein "Yes" dabane ka matlab hai ki aap khud confirm karte hain ki aap 18+ hain.</p>' +
    '<h2>3. Hamara content</h2><ul><li>Ye page sirf links ka ek directory hai. Hum Telegram, YouTube, Instagram ya kisi aur platform ka content khud host nahi karte.</li><li>Hum sirf wahi content share karte hain jiske adhikar ya permission hamare paas hain.</li><li>Hum kisi ka private, bina ijazat liya gaya ya leaked content share nahi karte, aur na hi ise promote karte hain.</li></ul>' +
    '<h2>4. Mana kiya gaya upyog</h2><ul><li>Kisi ki privacy ya gopniyata ka ulanghan karna.</li><li>Illegal, abusive ya nafrat failane wala content share karna.</li><li>Page ko hack karna, bot se spam karna ya galat tarike se data nikalna.</li></ul>' +
    '<h2>5. Thirdparty links</h2><p>Page par diye gaye links doosre platforms par le jaate hain. Unke content, policy aur suraksha ke liye wahi platform zimmedar hai, hum nahi.</p>' +
    '<h2>6. Content hatane ki request</h2><p>Agar aapko lagta hai ki koi link ya content aapke adhikar ya privacy ka ulanghan karta hai, to hamein batayein. Hum jaanch ke baad use jaldi hata denge. Sampark: ' + m + '.</p>' +
    '<h2>7. Zimmedari ki seema</h2><p>Page "jaisa hai" ke aadhar par diya gaya hai. Hum kisi link ke content ki sahi hone ya uplabdhta ki guarantee nahi dete.</p>' +
    '<h2>8. Badlav</h2><p>Hum ye Terms kabhi bhi badal sakte hain. Page use karte rehne ka matlab hai ki aap naye Terms maante hain.</p>');
}
function privacyPage(c) {
  const m = c.contact ? esc(c.contact) : 'site ke admin se Telegram/Instagram par sampark karein';
  return legal(c, 'Privacy Policy',
    '<h2>1. Hum kya jaankari lete hain</h2><ul><li>Aapka naam, phone ya email hum nahi maangte. Koi account ya login nahi hai.</li><li>Anonymous visit stats: aapke device ki ek hashed pehchaan, approximate desh/shehar, device ka type (mobile/desktop) aur aap page par kahan se aaye (jaise Instagram ya Telegram).</li><li>Kis link par kitni baar click hua, iski ginti.</li></ul>' +
    '<h2>2. Jaankari ka upyog</h2><p>Ye jaankari sirf ye samajhne ke liye hai ki page par kitne log aate hain aur kaunse link chalte hain. Hum ise bechte ya kisi ko nahi dete.</p>' +
    '<h2>3. Browser storage</h2><p>Aapka 18+ confirmation aapke browser mein save hota hai taaki baar-baar na puche. Isme koi personal data nahi hota. Aap browser data clear karke ise hata sakte hain.</p>' +
    '<h2>4. Doosre platforms</h2><p>Links par click karne ke baad aap Telegram, YouTube ya Instagram jaise platforms par jaate hain. Wahan unki apni privacy policy lagu hoti hai.</p>' +
    '<h2>5. Bachche</h2><p>Ye page 18 saal se kam umar ke logon ke liye nahi hai, aur hum jaankari se 18 se kam ka data nahi lete.</p>' +
    '<h2>6. Data kitne din rehta hai</h2><p>Anonymous stats tab tak rehte hain jab tak site ka admin unhe delete na kare.</p>' +
    '<h2>7. Sampark</h2><p>Privacy ke sawaal ya data hatane ki request ke liye: ' + m + '.</p>');
}

function adminPage() {
  const colorField = (label, p) => '<label>' + label + '</label><input type="color" data-p="' + p + '">';
  const body =
    '<div id="login" class="center" style="display:none"><div class="box fm" style="width:100%;max-width:340px"><h2>Admin Login</h2><input id="pw" type="password" placeholder="Password"><div class="btns"><button id="lgn" class="btn full">Login</button></div><p id="msg" style="color:#e5484d;margin-top:10px"></p></div></div>' +
    '<div id="app" style="display:none"><header class="hd"><b style="font-size:17px">&#9881; Page Builder</b><div class="hr"><button class="btn sm" id="sbtn">Save</button><a class="btn g sm" href="/" target="_blank">Open</a><button class="btn g sm" id="lo">Logout</button></div></header>' +
    '<nav class="tabs"><button data-t="links" class="on">Links</button><button data-t="design">Design</button><button data-t="set">Settings</button><button data-t="stats">Stats</button><button data-t="pv" class="tpv">Preview</button></nav>' +
    '<div class="lay"><div class="ed">' +
    // links
    '<section id="t_links" class="tp on"><div class="box"><h2>Links / Buttons</h2><p class="mu" style="font-size:13px;margin-bottom:10px">&#8942;&#8942; ko pakad kar upar-neeche drag karo. Badlav ke baad <b>Save</b> dabana.</p><div id="lks"></div><div class="btns"><button class="btn" id="addl">+ Link add karo</button></div></div></section>' +
    // design
    '<section id="t_design" class="tp"><div class="box"><h2>Ready Themes</h2><div class="ths" id="ths"></div></div>' +
    '<div class="box fm"><h2>Profile</h2><label>Photo / Logo URL</label><input data-p="avatar" placeholder="https://..."><label>Title</label><input data-p="title"><label>Bio</label><textarea data-p="bio" rows="3"></textarea></div>' +
    '<div class="box fm"><h2>Background</h2><label>Type</label><select data-p="bg.type"><option value="color">Solid colour</option><option value="gradient">Gradient</option><option value="image">Image</option></select>' +
    colorField('Colour 1', 'bg.c1') + colorField('Colour 2 (gradient)', 'bg.c2') +
    '<label>Gradient angle</label><input type="range" min="0" max="360" data-p="bg.angle"><label>Background image URL</label><input data-p="bg.img" placeholder="https://..."><label>Image dark overlay</label><input type="range" min="0" max="0.9" step="0.05" data-p="bg.ov"></div>' +
    '<div class="box fm"><h2>Text</h2>' + colorField('Text colour', 'tx') + '<label>Font</label><select data-p="font"><option value="sans">Modern Sans</option><option value="serif">Serif</option><option value="mono">Mono</option><option value="round">Rounded</option></select></div>' +
    '<div class="box fm"><h2>Buttons</h2><label>Style</label><select data-p="btn.style"><option value="grad">Gradient</option><option value="fill">Solid</option><option value="outline">Outline</option><option value="glass">Glass</option></select>' +
    colorField('Colour 1', 'btn.c1') + colorField('Colour 2 (gradient / premium)', 'btn.c2') + colorField('Button text colour', 'btn.tc') +
    '<label>Corner roundness</label><input type="range" min="0" max="40" data-p="btn.r"></div></section>' +
    // settings
    '<section id="t_set" class="tp"><div class="box fm"><h2>18+ Age Alert</h2><label class="ck"><input type="checkbox" data-p="age.on"> Page khulte hi 18+ popup dikhao</label><label>Title</label><input data-p="age.title"><label>Text</label><textarea data-p="age.text" rows="3"></textarea><label>Yes button</label><input data-p="age.yes"><label>No button (No dabane par Google par bhejta hai)</label><input data-p="age.no"></div>' +
    '<div class="box fm"><h2>Site &amp; Legal Pages</h2><label>Site ka naam (Terms/Privacy mein dikhega)</label><input data-p="site"><label>Contact email ya Telegram id (takedown request ke liye)</label><input data-p="contact"><div class="btns"><a class="btn g sm" href="/terms" target="_blank">Terms dekho</a><a class="btn g sm" href="/privacy" target="_blank">Privacy dekho</a></div></div>' +
    '<div class="box"><h2>Important Links</h2><p class="mu" style="font-size:13px;margin-bottom:6px">Website</p><code id="l1"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Instagram bio link (tracking ke saath)</p><code id="l2"></code><p class="mu" style="font-size:13px;margin:10px 0 6px">Telegram ke liye tracked link</p><code id="l3"></code></div></section>' +
    // stats
    '<section id="t_stats" class="tp"><div class="rg" id="rg" style="display:flex;gap:8px;margin-bottom:14px"><button data-d="7" class="on">7 din</button><button data-d="30">30 din</button><button data-d="90">90 din</button></div><div id="dash"></div></section>' +
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
      if (path === '/' && method === 'GET') {
        ctx.waitUntil(trackVisit(req, env, u).catch(() => {}));
        return publicPage(await getPage(env));
      }

      let m = path.match(/^\/l\/([a-z0-9]{4,12})$/i);
      if (m && method === 'GET') {
        const c = await getPage(env);
        const l = c.links.find((x) => x.id === m[1]);
        if (!l) return new Response(null, { status: 302, headers: { Location: '/' } });
        if (!isBot(ua)) ctx.waitUntil(env.DB.prepare('INSERT INTO lclicks (day,lid,c) VALUES (?,?,1) ON CONFLICT(day,lid) DO UPDATE SET c=c+1').bind(dayStr(), l.id).run().catch(() => {}));
        return new Response(null, { status: 302, headers: { Location: l.url, 'Cache-Control': 'no-store' } });
      }

      if (path === '/terms' && method === 'GET') return termsPage(await getPage(env));
      if (path === '/privacy' && method === 'GET') return privacyPage(await getPage(env));
      if (path === '/admin' && method === 'GET') return adminPage();

      if (path === '/api/admin/login' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && env.SESSION_SECRET && b.password === env.ADMIN_PASSWORD) {
          const tok = await makeToken(env);
          return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'adm=' + tok + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800' } });
        }
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: 'bad password' }, 401);
      }
      if (path === '/api/admin/logout' && method === 'POST')
        return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'adm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' } });

      if (path.startsWith('/api/admin/')) {
        if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
        if (path === '/api/admin/page' && method === 'GET') { cache.t = 0; return json({ page: await getPage(env) }); }
        if (path === '/api/admin/page' && method === 'POST') {
          const c = clean(await req.json());
          await env.DB.prepare("INSERT INTO settings (k,v) VALUES ('page',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(c)).run();
          cache = { t: Date.now(), v: c };
          return json({ ok: true, page: c });
        }
        if (path === '/api/admin/stats' && method === 'GET') return json(await stats(env, parseInt(u.searchParams.get('days'))));
      }

      return new Response(null, { status: 302, headers: { Location: '/' } });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
