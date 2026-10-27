// ============================================================
// Fast Post Feed + Admin Panel + Telegram Redirect Page
// Cloudflare Workers + D1 (free plan) - single file
// Bindings needed:  D1 database -> variable name: DB
// Secrets needed:   ADMIN_PASSWORD, SESSION_SECRET
// ============================================================

const enc = new TextEncoder();
let ready = false;

const CSS = `
:root{--bg:#121212;--card:#1e1e1e;--bd:#2c2c2c;--tx:#f2f2f2;--mu:#9a9a9a;--ac:#29a9eb}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:inherit;text-decoration:none}
header{position:sticky;top:0;z-index:5;background:rgba(13,13,13,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--bd);display:flex;gap:12px;align-items:center;padding:10px 14px}
.brand{font-weight:700;font-size:18px;white-space:nowrap}
.search{flex:1;min-width:0;background:#1c1c1c;border:1px solid var(--bd);border-radius:12px;padding:10px 12px;color:var(--tx);font-size:15px;outline:none}
main{max-width:640px;margin:0 auto;padding:14px 14px 80px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:18px;margin-bottom:16px;overflow:hidden}
.th{position:relative;background:#232323;display:flex;justify-content:center;align-items:center;height:340px}
.th img{height:100%;max-width:100%;object-fit:contain}
.dur{position:absolute;right:10px;bottom:10px;background:rgba(0,0,0,.8);padding:3px 8px;border-radius:8px;font-size:13px}
.meta{padding:14px 16px}
.t{font-size:18px;display:block}
.row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:var(--mu);font-size:15px}
.sh{background:none;border:0;color:var(--mu);font-size:20px;cursor:pointer}
.tg{position:fixed;left:12px;right:12px;bottom:12px;max-width:616px;margin:0 auto;background:var(--ac);color:#fff;text-align:center;padding:13px;border-radius:14px;font-weight:600;z-index:6}
.btn{display:inline-block;background:var(--ac);color:#fff;border:0;border-radius:12px;padding:13px 22px;font-size:16px;font-weight:600;cursor:pointer}
.center{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:18px}
.ring{width:96px;height:96px;border-radius:50%;border:6px solid #2a2a2a;border-top-color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;animation:sp 1s linear infinite}
.ring span{animation:sp2 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@keyframes sp2{to{transform:rotate(-360deg)}}
.box{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:16px;margin-bottom:16px}
.box input,.box textarea{width:100%;background:#161616;border:1px solid var(--bd);border-radius:10px;padding:10px;color:var(--tx);font-size:15px;margin:6px 0}
.it{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--bd);font-size:14px}
.it button{background:#2a2a2a;color:#fff;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
h2{font-size:17px;margin-bottom:8px}
`;

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const html = (b, status = 200, h = {}) => new Response(b, { status, headers: { 'Content-Type': 'text/html;charset=utf-8', ...h } });
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...h } });
const okUrl = (u) => !u || /^https?:\/\/[^\s]+$/i.test(u);

function layout(title, body, head, script) {
  return '<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) + '</title>' + (head || '') + '<style>' + CSS + '</style></head><body>' + body + (script ? '<script>' + script + '</script>' : '') + '</body></html>';
}

async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, thumb TEXT, link TEXT, duration TEXT, views INTEGER DEFAULT 0, created_at INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
  ]);
  ready = true;
}

async function getSettings(env) {
  const s = { site_name: 'My Box', telegram_url: 'https://t.me/yourchannel', countdown: '5' };
  const { results } = await env.DB.prepare('SELECT k,v FROM settings').all();
  for (const r of results) s[r.k] = r.v;
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
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Date.now() > +exp) return false;
  return sig === (await hmac(env.SESSION_SECRET, exp));
}

// ---------- client scripts (no backticks / no dollar-brace inside) ----------
const FEED_JS = `
var page=1,busy=false,more=true,q='';
var list=document.getElementById('list');
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);}
function card(p){
 return '<article class="card"><a href="/p/'+p.id+'"><div class="th">'+(p.thumb?'<img loading="lazy" src="'+esc(p.thumb)+'" alt="">':'')+(p.duration?'<span class="dur">'+esc(p.duration)+'</span>':'')+'</div></a><div class="meta"><a class="t" href="/p/'+p.id+'">'+esc(p.title)+'</a><div class="row"><span>&#128065; '+fmt(p.views)+'</span><button class="sh" data-id="'+p.id+'" data-t="'+esc(p.title)+'" aria-label="Share">&#10150;</button></div></div></article>';
}
async function load(reset){
 if(busy)return; if(reset){page=1;more=true;list.innerHTML='';}
 if(!more)return; busy=true;
 try{
  var r=await fetch('/api/posts?page='+page+'&q='+encodeURIComponent(q));
  var d=await r.json();
  list.insertAdjacentHTML('beforeend',d.posts.map(card).join(''));
  more=d.more; page++;
  if(!d.posts.length&&reset)list.innerHTML='<p style="color:#9a9a9a;text-align:center;margin-top:40px">Koi post nahi mila</p>';
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
load(true);
`;

const ADMIN_JS = `
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function show(ok){$('login').style.display=ok?'none':'block';$('panel').style.display=ok?'block':'none';}
async function api(u,m,b){
 var r=await fetch(u,{method:m||'GET',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
 if(r.status===401){show(false);throw new Error('auth');}
 return r.json();
}
async function login(){
 var r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('pw').value})});
 if(r.ok){$('pw').value='';show(true);refresh();}else{$('msg').textContent='Galat password';}
}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});show(false);}
var posts=[];
async function refresh(){
 var s=await api('/api/admin/settings');
 $('s_name').value=s.site_name;$('s_tg').value=s.telegram_url;$('s_cd').value=s.countdown;
 var d=await api('/api/admin/posts');posts=d.posts;
 $('items').innerHTML=posts.map(function(p){return '<div class="it"><div><b>#'+p.id+'</b> '+esc(p.title)+' <small style="color:#9a9a9a">&#128065; '+p.views+'</small></div><div><button onclick="edit('+p.id+')">Edit</button> <button onclick="del('+p.id+')">Delete</button></div></div>';}).join('')||'<p style="color:#9a9a9a">Abhi koi post nahi</p>';
}
function edit(id){
 var p=posts.filter(function(x){return x.id===id})[0];
 $('f_id').value=id;$('f_title').value=p.title;$('f_thumb').value=p.thumb||'';$('f_link').value=p.link||'';$('f_dur').value=p.duration||'';$('f_views').value=p.views;
 $('formh').textContent='Post #'+id+' edit karo';window.scrollTo(0,0);
}
function clearf(){['f_id','f_title','f_thumb','f_link','f_dur','f_views'].forEach(function(i){$(i).value='';});$('formh').textContent='Naya Post';}
async function save(){
 var b={title:$('f_title').value,thumb:$('f_thumb').value,link:$('f_link').value,duration:$('f_dur').value,views:$('f_views').value};
 var id=$('f_id').value;
 var r=id?await api('/api/admin/posts/'+id,'PUT',b):await api('/api/admin/posts','POST',b);
 if(r.error){alert(r.error);return;}
 clearf();refresh();
}
async function del(id){if(!confirm('Post #'+id+' delete karein?'))return;await api('/api/admin/posts/'+id,'DELETE');refresh();}
async function saveS(){
 var r=await api('/api/admin/settings','POST',{site_name:$('s_name').value,telegram_url:$('s_tg').value,countdown:$('s_cd').value});
 if(r.error){alert(r.error);return;} alert('Settings save ho gayi');
}
fetch('/api/admin/posts').then(function(r){if(r.ok){show(true);refresh();}else show(false);});
`;

// ---------- pages ----------
function feedPage(s) {
  const body =
    '<header><a class="brand" href="/">' + esc(s.site_name) + '</a><input id="q" class="search" type="search" placeholder="Search posts..."></header>' +
    '<main><div id="list"></div><div id="end" style="height:1px"></div></main>' +
    '<a class="tg" href="/go">&#9992; Telegram Channel Join Karo</a>';
  return html(layout(s.site_name, body, '<meta property="og:title" content="' + esc(s.site_name) + '">', FEED_JS), 200, { 'Cache-Control': 'public, max-age=60' });
}

function postPage(s, p) {
  const body =
    '<header><a class="brand" href="/">&larr; ' + esc(s.site_name) + '</a></header><main>' +
    '<article class="card"><div class="th" style="height:420px">' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="">' : '') +
    (p.duration ? '<span class="dur">' + esc(p.duration) + '</span>' : '') + '</div><div class="meta"><h1 class="t">' + esc(p.title) +
    '</h1><div class="row"><span>&#128065; ' + p.views + '</span></div><div style="margin-top:16px;text-align:center"><a class="btn" href="/go?id=' + p.id + '">Open Karo</a></div></div></article></main>' +
    '<a class="tg" href="/go">&#9992; Telegram Channel Join Karo</a>';
  const head = '<meta property="og:title" content="' + esc(p.title) + '">' + (p.thumb ? '<meta property="og:image" content="' + esc(p.thumb) + '">' : '');
  return html(layout(p.title + ' - ' + s.site_name, body, head));
}

function goPage(s, target) {
  const sec = Math.min(Math.max(parseInt(s.countdown) || 5, 1), 30);
  const body =
    '<div class="center"><div class="ring"><span id="n">' + sec + '</span></div><h2>Aapko redirect kiya ja raha hai...</h2>' +
    '<p style="color:#9a9a9a">Agar apne aap na khule to neeche button dabayein</p>' +
    '<a id="go" class="btn" href="' + esc(target) + '">Telegram Kholo</a></div>';
  const js = 'var n=' + sec + ';var el=document.getElementById("n");var u=document.getElementById("go").href;' +
    'var t=setInterval(function(){n--;el.textContent=n;if(n<=0){clearInterval(t);location.href=u;}},1000);';
  return html(layout('Redirecting...', body, '<meta name="robots" content="noindex">', js), 200, { 'Cache-Control': 'no-store' });
}

function adminPage() {
  const body =
    '<main>' +
    '<div id="login" class="box" style="display:none;margin-top:40px"><h2>Admin Login</h2><input id="pw" type="password" placeholder="Password" onkeydown="if(event.key===\'Enter\')login()"><button class="btn" onclick="login()">Login</button><p id="msg" style="color:#ff6b6b;margin-top:8px"></p></div>' +
    '<div id="panel" style="display:none">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0"><h2>Admin Panel</h2><button class="btn" style="padding:8px 14px" onclick="logout()">Logout</button></div>' +
    '<div class="box"><h2>Site Settings</h2><input id="s_name" placeholder="Site ka naam"><input id="s_tg" placeholder="Telegram channel link (https://t.me/...)"><input id="s_cd" type="number" placeholder="Countdown seconds (5)"><button class="btn" onclick="saveS()">Save Settings</button></div>' +
    '<div class="box"><h2 id="formh">Naya Post</h2><input type="hidden" id="f_id"><input id="f_title" placeholder="Title"><input id="f_thumb" placeholder="Thumbnail image URL (https://...)"><input id="f_link" placeholder="Post link (khali chhodo to Telegram link khulega)"><input id="f_dur" placeholder="Duration (jaise 15:14)"><input id="f_views" type="number" placeholder="Views (optional)"><button class="btn" onclick="save()">Save Post</button> <button class="btn" style="background:#333" onclick="clearf()">Clear</button></div>' +
    '<div class="box"><h2>Saare Posts</h2><div id="items"></div></div></div></main>';
  return html(layout('Admin', body, '<meta name="robots" content="noindex,nofollow">', ADMIN_JS), 200, { 'Cache-Control': 'no-store' });
}

// ---------- main ----------
export default {
  async fetch(req, env, ctx) {
    if (!env.DB) return new Response('D1 binding "DB" missing', { status: 500 });
    await init(env);
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Public pages
      if (path === '/' && method === 'GET') return feedPage(await getSettings(env));

      if (path === '/api/posts' && method === 'GET') {
        const pg = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
        const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
        const lim = 12, off = (pg - 1) * lim;
        const st = q
          ? env.DB.prepare('SELECT id,title,thumb,duration,views FROM posts WHERE title LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?').bind('%' + q + '%', lim, off)
          : env.DB.prepare('SELECT id,title,thumb,duration,views FROM posts ORDER BY id DESC LIMIT ? OFFSET ?').bind(lim, off);
        const { results } = await st.all();
        return json({ posts: results, more: results.length === lim }, 200, { 'Cache-Control': 'public, max-age=30' });
      }

      let m = path.match(/^\/p\/(\d+)$/);
      if (m && method === 'GET') {
        const p = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(+m[1]).first();
        if (!p) return html(layout('Not found', '<div class="center"><h2>Post nahi mila</h2><a class="btn" href="/">Home</a></div>'), 404);
        ctx.waitUntil(env.DB.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(p.id).run());
        p.views += 1;
        return postPage(await getSettings(env), p);
      }

      // Loading / redirect page (Instagram bio link -> /go)
      if (path === '/go' && method === 'GET') {
        const s = await getSettings(env);
        let target = s.telegram_url;
        const id = parseInt(url.searchParams.get('id'));
        if (id) {
          const p = await env.DB.prepare('SELECT link FROM posts WHERE id=?').bind(id).first();
          if (p && p.link && okUrl(p.link)) target = p.link;
        }
        return goPage(s, target);
      }

      // Admin
      if (path === '/admin' && method === 'GET') return adminPage();

      if (path === '/api/admin/login' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && b.password === env.ADMIN_PASSWORD && env.SESSION_SECRET) {
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

        if (path === '/api/admin/posts' && method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT 300').all();
          return json({ posts: results });
        }
        if (path === '/api/admin/posts' && method === 'POST') {
          const b = await req.json();
          const title = String(b.title || '').trim().slice(0, 200);
          if (!title) return json({ error: 'Title zaroori hai' });
          if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URL http:// ya https:// se shuru hona chahiye' });
          await env.DB.prepare('INSERT INTO posts (title,thumb,link,duration,views,created_at) VALUES (?,?,?,?,?,?)')
            .bind(title, b.thumb || '', b.link || '', String(b.duration || '').slice(0, 12), parseInt(b.views) || 0, Date.now()).run();
          return json({ ok: true });
        }
        m = path.match(/^\/api\/admin\/posts\/(\d+)$/);
        if (m && method === 'PUT') {
          const b = await req.json();
          const title = String(b.title || '').trim().slice(0, 200);
          if (!title) return json({ error: 'Title zaroori hai' });
          if (!okUrl(b.thumb) || !okUrl(b.link)) return json({ error: 'URL http:// ya https:// se shuru hona chahiye' });
          await env.DB.prepare('UPDATE posts SET title=?,thumb=?,link=?,duration=?,views=? WHERE id=?')
            .bind(title, b.thumb || '', b.link || '', String(b.duration || '').slice(0, 12), parseInt(b.views) || 0, +m[1]).run();
          return json({ ok: true });
        }
        if (m && method === 'DELETE') {
          await env.DB.prepare('DELETE FROM posts WHERE id=?').bind(+m[1]).run();
          return json({ ok: true });
        }
        if (path === '/api/admin/settings' && method === 'GET') return json(await getSettings(env));
        if (path === '/api/admin/settings' && method === 'POST') {
          const b = await req.json();
          if (!okUrl(b.telegram_url)) return json({ error: 'Telegram link galat hai' });
          const set = async (k, v) => env.DB.prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, String(v)).run();
          await set('site_name', String(b.site_name || 'My Box').slice(0, 60));
          await set('telegram_url', b.telegram_url || 'https://t.me/yourchannel');
          await set('countdown', Math.min(Math.max(parseInt(b.countdown) || 5, 1), 30));
          return json({ ok: true });
        }
      }

      return html(layout('Not found', '<div class="center"><h2>404</h2><a class="btn" href="/">Home</a></div>'), 404);
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
