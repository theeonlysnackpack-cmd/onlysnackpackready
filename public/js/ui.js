// UI helpers: modal, tooltips, toasts, avatars, now-playing bar, spotlight dark mode.
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  function el(tag, attrs, kids){
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs){
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (kids){
      (Array.isArray(kids)?kids:[kids]).forEach(c => {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }
  function escapeHTML(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ---- modal ----
  const modalRoot = $('#modalRoot'), modalTitle = $('#modalTitle'), modalBody = $('#modalBody');
  let modalCloseCb = null;
  function openModal(title, bodyBuilder, opts){
    opts = opts||{};
    modalTitle.textContent = title;
    modalBody.innerHTML = '';
    const node = typeof bodyBuilder === 'function' ? bodyBuilder(modalBody) : bodyBuilder;
    if (node instanceof Node) modalBody.appendChild(node);
    modalRoot.classList.remove('hidden');
    modalCloseCb = opts.onClose || null;
  }
  function closeModal(){
    modalRoot.classList.add('hidden');
    modalBody.innerHTML = '';
    if (modalCloseCb) { const cb = modalCloseCb; modalCloseCb = null; cb(); }
  }
  modalRoot.addEventListener('click',(e)=>{
    if (e.target.matches('[data-close]')) closeModal();
  });
  document.addEventListener('keydown',(e)=>{
    if (e.key === 'Escape' && !modalRoot.classList.contains('hidden')) closeModal();
  });

  // ---- toast ----
  function toast(msg, kind){
    const t = el('div',{class:'toast '+(kind||'')}, msg);
    Object.assign(t.style,{
      position:'fixed',bottom:'70px',left:'50%',transform:'translateX(-50%)',
      background: kind==='bad'?'#3a1010':kind==='good'?'#0e2a16':'#0f0f1a',
      color: kind==='bad'?'#ff8a8a':kind==='good'?'#7dffae':'#cdefff',
      border:'1px solid '+(kind==='bad'?'#ff5b5b':kind==='good'?'#4aff8c':'#2a2a3c'),
      padding:'8px 14px',borderRadius:'4px',zIndex:100,fontFamily:'var(--mono)',fontSize:'12px',letterSpacing:'1px',
      boxShadow:'0 10px 30px rgba(0,0,0,.6)',opacity:'0',transition:'opacity .2s'
    });
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.style.opacity='1');
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2200);
  }

  // ---- tooltips (sidebar, so you know what you click) ----
  const tt = $('#tooltip');
  function bindTooltips(root){
    $$('[data-tooltip]', root||document).forEach(n=>{
      n.addEventListener('mouseenter', e => {
        tt.textContent = n.getAttribute('data-tooltip');
        tt.classList.remove('hidden');
      });
      n.addEventListener('mousemove', e => {
        tt.style.left = (e.clientX + 12) + 'px';
        tt.style.top  = (e.clientY + 12) + 'px';
      });
      n.addEventListener('mouseleave', () => tt.classList.add('hidden'));
    });
  }

  // ---- avatar ----
  function avatarEl(user, size){
    const d = el('div',{class:'p-avatar'});
    if (size) { d.style.width = size+'px'; d.style.height = size+'px'; d.style.fontSize = Math.floor(size*0.4)+'px'; }
    if (user && user.avatar){
      d.style.background = 'url('+user.avatar+') center/cover';
    } else {
      d.style.background = 'linear-gradient(135deg,'+(user&&user.color||'#7df9ff')+','+(user&&user.color?shade(user.color,-30):'#ff6ec7')+')';
      d.textContent = (user && (user.displayName||user.username||'?')) ? (user.displayName||user.username).slice(0,1).toUpperCase() : '?';
    }
    return d;
  }
  function shade(hex, percent){
    let c = hex.replace('#','');
    if (c.length===3) c = c.split('').map(x=>x+x).join('');
    const num = parseInt(c,16);
    let r=(num>>16)+percent, g=((num>>8)&0xff)+percent, b=(num&0xff)+percent;
    r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
    return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
  }

  function fmtDate(iso){
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now()-d.getTime())/1000;
    let rel;
    if (diff<60) rel = Math.floor(diff)+'s ago';
    else if (diff<3600) rel = Math.floor(diff/60)+'m ago';
    else if (diff<86400) rel = Math.floor(diff/3600)+'h ago';
    else if (diff<86400*7) rel = Math.floor(diff/86400)+'d ago';
    else rel = d.toLocaleDateString();
    return { rel, full: d.toLocaleString(), iso };
  }
  function fmtJoined(iso){
    if (!iso) return '';
    const d = new Date(iso);
    return 'joined '+d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }

  // ---- global now-playing bar (used by post music + music library) ----
  const np = $('#nowPlaying'), npAudio = $('#npAudio'), npTitle = $('#npTitle'), npSub = $('#npSub');
  const npPlay = $('#npPlay'), npSeek = $('#npSeek'), npVol = $('#npVol'), npClose = $('#npClose');
  let npState = { url: null, title: '', sub: '' };
  npAudio.volume = parseFloat(npVol.value||'0.7');
  function playMusic(url, title, sub){
    if (!url) return;
    if (npState.url !== url){
      npAudio.src = url;
      npState = { url, title: title||'untitled', sub: sub||'' };
      npTitle.textContent = npState.title;
      npSub.textContent = npState.sub;
    }
    np.classList.remove('hidden');
    npAudio.play().then(()=>{ npPlay.textContent='❚❚'; }).catch(()=>{ npPlay.textContent='▶'; });
  }
  npPlay.addEventListener('click',()=>{
    if (npAudio.paused){ npAudio.play(); npPlay.textContent='❚❚'; }
    else { npAudio.pause(); npPlay.textContent='▶'; }
  });
  npAudio.addEventListener('ended',()=>{ npPlay.textContent='▶'; });
  npAudio.addEventListener('timeupdate',()=>{
    if (npAudio.duration) npSeek.value = (npAudio.currentTime/npAudio.duration)*100;
  });
  npSeek.addEventListener('input',()=>{
    if (npAudio.duration) npAudio.currentTime = (parseFloat(npSeek.value)/100)*npAudio.duration;
  });
  npVol.addEventListener('input',()=>{ npAudio.volume = parseFloat(npVol.value); });
  npClose.addEventListener('click',()=>{ npAudio.pause(); np.classList.add('hidden'); npState.url=null; });

  // ---- spotlight dark mode ----
  const spot = $('#spotlight');
  let spotMode = localStorage.getItem('osp_spotlight') === '1';
  let spotCur = null;
  function applySpotlight(on){
    spotMode = !!on;
    localStorage.setItem('osp_spotlight', on?'1':'0');
    document.body.classList.toggle('spotmode', on);
    spot.classList.toggle('hidden', !on);
    if (on && !spotCur){
      spotCur = el('div',{class:'spot-cursor'});
      document.body.appendChild(spotCur);
      const move = (e)=>{
        const x=e.clientX, y=e.clientY;
        spotCur.style.left = x+'px'; spotCur.style.top = y+'px';
        const r = 220;
        spot.style.background = `radial-gradient(circle ${r}px at ${x}px ${y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,.85) 60%, rgba(0,0,0,.96) 100%)`;
      };
      document.addEventListener('mousemove', move);
      move({clientX:window.innerWidth/2, clientY:window.innerHeight/2});
    }
  }

  // ---- settings store ----
  const DEFAULTS = { accent: '#7df9ff', bgImage: '', reducedMotion: false, font: 'default', customCss: '', fontSize: 12, glitter: true, scanlines: true };
  function loadSettings(){
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('osp_settings')||'{}')); }
    catch(e){ return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s){ localStorage.setItem('osp_settings', JSON.stringify(s)); applySettings(s); }
  function applySettings(s){
    s = Object.assign({}, DEFAULTS, s||{});
    document.documentElement.style.setProperty('--accent', s.accent || DEFAULTS.accent);
    if (s.font){
      const fam = {default:'var(--sans)',mono:'var(--mono)',pixel:'var(--pixel)',comic:'var(--comic)'}[s.font] || 'var(--sans)';
      document.body.style.fontFamily = fam;
    }
    if (s.fontSize){
      document.documentElement.style.fontSize = s.fontSize+'px';
    }
    const gl = document.getElementById('glitter');
    if (gl) gl.style.display = (s.glitter===false)?'none':'';
    document.body.classList.toggle('no-scanlines', s.scanlines===false);
    if (s.customCss){
      let tag = document.getElementById('customCss');
      if (!tag){ tag = document.createElement('style'); tag.id='customCss'; document.head.appendChild(tag); }
      tag.textContent = s.customCss;
    }
    // remove customCss tag if empty
    if (!s.customCss){
      const tag = document.getElementById('customCss');
      if (tag) tag.remove();
    }
  }

  // ---- clock ----
  function pad(n){return String(n).padStart(2,'0');}
  function tickClock(){
    const d = new Date();
    const el = document.getElementById('tvClock');
    if (el) el.textContent = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }
  setInterval(tickClock, 1000); tickClock();

  // ---- scroll-to-top ----
  function bindScrollTop(){
    const btn = document.getElementById('scrollTop');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      const sc = document.getElementById('screen');
      if (sc) sc.scrollTo({top:0,behavior:'smooth'});
      else window.scrollTo({top:0,behavior:'smooth'});
    });
    function check(){
      const sc = document.getElementById('screen');
      const y = sc ? sc.scrollTop : window.scrollY;
      btn.classList.toggle('on', y > 300);
    }
    document.addEventListener('scroll', check, true);
    setTimeout(()=>{
      const sc = document.getElementById('screen');
      if (sc) sc.addEventListener('scroll', check);
      check();
    }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindScrollTop);
  else bindScrollTop();

  window.UI = { $, $$, el, openModal, closeModal, toast, bindTooltips, avatarEl, escapeHTML, fmtDate, fmtJoined, playMusic, applySpotlight, spotMode:()=>spotMode, loadSettings, saveSettings, applySettings };
})();
