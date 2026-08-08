// Windows-XP-ish window manager for ONLYSNACKPACK.
// Handles: draggable windows, taskbar, start menu, desktop icons, glitter trail,
// MSN-style popup, guestbook mini window helper.
(function(){
  const { $, $$, el, toast } = window.UI;

  // -------- clock (taskbar + TV) --------
  function pad(n){return String(n).padStart(2,'0');}
  function tick(){
    const d = new Date();
    const tray=document.getElementById('trayClock');
    if (tray) tray.textContent = pad(d.getHours())+':'+pad(d.getMinutes());
    const tv=document.getElementById('tvClock');
    if (tv) tv.textContent = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }
  setInterval(tick,1000); tick();

  // ---------- window drag/focus ----------
  let winZ = 30;
  function focusWindow(win){
    $$('.window').forEach(w=>w.classList.remove('focused'));
    win.classList.add('focused');
    win.style.zIndex = ++winZ;
    updateTaskbar();
  }
  function makeDraggable(win, handle){
    let ox=0,oy=0,dragging=false;
    handle.addEventListener('mousedown', e=>{
      if (e.target.closest('.wb') || e.target.closest('.win-menu')) return;
      dragging=true; focusWindow(win);
      const r=win.getBoundingClientRect();
      ox=e.clientX-r.left; oy=e.clientY-r.top;
      function mv(ev){
        if(!dragging)return;
        let x=ev.clientX-ox, y=ev.clientY-oy;
        x=Math.max(-win.offsetWidth+80,Math.min(window.innerWidth-80,x));
        y=Math.max(0,Math.min(window.innerHeight-60,y));
        win.style.left=x+'px';win.style.top=y+'px';win.style.right='auto';win.style.bottom='auto';
      }
      function up(){dragging=false;document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
      e.preventDefault();
    });
    win.addEventListener('mousedown',()=>focusWindow(win));
  }

  // ---------- Taskbar ----------
  function updateTaskbar(){
    const tb = $('#taskWindows'); tb.innerHTML='';
    // main win always first
    const main = $('#mainWin');
    if (main){
      const mainBtn = el('button',{class:'task-win'+(main.classList.contains('focused') && !main.classList.contains('minimized')?' active':'')}, [el('span',{}, '★ onlysnackpack')]);
      mainBtn.addEventListener('click',()=>{
        if (main.classList.contains('minimized')){ main.classList.remove('minimized'); focusWindow(main); }
        else if (main.classList.contains('focused')){ main.classList.add('minimized'); }
        else { focusWindow(main); }
        updateTaskbar();
      });
      tb.appendChild(mainBtn);
    }
    $$('.window').forEach(w=>{
      if (w.id==='mainWin') return;
      const name = w.dataset.title || 'window';
      const btn = el('button',{class:'task-win'+(w.classList.contains('focused') && !w.classList.contains('minimized')?' active':'')}, [el('span',{}, name)]);
      btn.addEventListener('click',()=>{
        if (w.classList.contains('minimized')){ w.classList.remove('minimized'); focusWindow(w); }
        else if (w.classList.contains('focused')){ w.classList.add('minimized'); focusWindow(main); }
        else { w.classList.remove('minimized'); focusWindow(w);}
        updateTaskbar();
      });
      tb.appendChild(btn);
    });
  }

  // ---------- Start menu ----------
  const startMenu=$('#startMenu'), startBtn=$('#startBtn');
  function toggleStart(){startMenu.classList.toggle('hidden');}
  startBtn.addEventListener('click',e=>{e.stopPropagation();toggleStart();});
  document.addEventListener('click',e=>{
    if (!startMenu.classList.contains('hidden') && !startMenu.contains(e.target) && e.target!==startBtn){
      startMenu.classList.add('hidden');
    }
  });

  function bindStartItems(){
    $$('.start-item[data-view]',startMenu).forEach(b=>{
      b.addEventListener('click',()=>{window.FEED.route(b.dataset.view); startMenu.classList.add('hidden');$('#mainWin').classList.remove('minimized');focusWindow($('#mainWin'));});
    });
  }

  // ---------- Desktop icons ----------
  function makeDesktopIcon(ico, label, onclick){
    const d = el('div',{class:'desk-icon',title:label},[el('span',{class:'desk-ico'},ico),el('span',{class:'lbl'},label)]);
    d.addEventListener('dblclick',onclick);
    return d;
  }
  function buildDesktop(){
    const desk = $('#desktop'); desk.innerHTML='';
    desk.appendChild(makeDesktopIcon('★','home',()=>{window.FEED.route('home');$('#mainWin').classList.remove('minimized');focusWindow($('#mainWin'));}));
    desk.appendChild(makeDesktopIcon('☺','my profile',()=>{const me=window.FEED.state.me; if(me) window.FEED.route('profile',me.username); else window.OSP.openAuth('signup');}));
    desk.appendChild(makeDesktopIcon('♪','music',()=>window.FEED.route('musiclibrary')));
    desk.appendChild(makeDesktopIcon('✎','guestbook',()=>window.FEED.route('guestbook')));
    desk.appendChild(makeDesktopIcon('✉','notes',()=>{
      const saved = localStorage.getItem('osp_stickynote')||'double-click to start writing. notes save to this browser.';
      const pad = el('div',{style:'padding:10px;font-family:var(--comic);font-size:14px;background:#fff7a0;min-height:220px;outline:none;white-space:pre-wrap;overflow-y:auto',contentEditable:'true'}, saved);
      pad.addEventListener('input',()=>{localStorage.setItem('osp_stickynote', pad.innerText);});
      WIN.popWindow({title:'sticky note',ico:'✎',content:pad,width:320,height:280});
    }));
    desk.appendChild(makeDesktopIcon('⚠','ONLYSNACKPACK',()=>window.FEED.route('admin')));
  }

  // ---------- visitor counter ----------
  function bumpHits(){
    let n = parseInt(localStorage.getItem('osp_hits')||'0',10)+1;
    localStorage.setItem('osp_hits',String(n));
    const padded = String(n).padStart(6,'0');
    ['hitCount','visitorNum','visitorNum2'].forEach(id=>{
      const el=document.getElementById(id);
      if (el) el.textContent = padded;
    });
  }

  // ---------- glitter trail ----------
  let lastGlitter=0;
  document.addEventListener('mousemove', e=>{
    if (Date.now()-lastGlitter<35) return;
    lastGlitter=Date.now();
    const s=el('span',{class:'glitter-star'},['*']);
    const colors=['var(--pink)','var(--cyan)','var(--yellow)','var(--lime)','var(--purple)'];
    s.style.color=colors[Math.floor(Math.random()*colors.length)];
    s.style.left=e.clientX+'px';s.style.top=e.clientY+'px';
    s.style.setProperty('--dx',(Math.random()*40-20)+'px');
    s.style.setProperty('--dy',(Math.random()*40-20)+15+'px');
    $('#glitter').appendChild(s);
    setTimeout(()=>s.remove(),900);
  });

  // ---------- MSN popup ----------
  const msn = $('#msnToast');
  let msnTimer=null;
  function msnPop(title, text, icoChar){
    const mt=$('#msnTitle'), mb=$('#msnText'), ma=$('#msnAvatar');
    mt.textContent=title||'buddy'; mb.textContent=text||''; ma.textContent=icoChar||'★';
    msn.classList.remove('hidden');
    clearTimeout(msnTimer);
    msnTimer=setTimeout(()=>msn.classList.add('hidden'),4500);
  }
  $('#msnClose').addEventListener('click',()=>{clearTimeout(msnTimer);msn.classList.add('hidden');});

  // ---------- tray buttons ----------
  $('#traySpot').addEventListener('click',()=>{
    const on = !document.body.classList.contains('spotmode');
    window.UI.applySpotlight(on);
    $('#spotCursor').classList.toggle('hidden', !on);
    toast(on?'spotlight on':'spotlight off','good');
  });
  $('#trayVol').addEventListener('click',()=>{
    const a=$('#npAudio');
    if (a.paused) { toast('press play on a track first'); } else { a.muted=!a.muted; $('#trayVol').textContent=a.muted?'♪̸':'♪';}
  });

  // ---------- win buttons ----------
  function wireWinControls(win){
    win.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(win.id==='mainWin'){win.classList.add('minimized');}
      else win.remove();
      focusWindow($('#mainWin'));
      updateTaskbar();
    }));
    win.querySelectorAll('[data-min]').forEach(b=>b.addEventListener('click',(e)=>{
      e.stopPropagation();
      win.classList.add('minimized');
      focusWindow($('#mainWin'));
      updateTaskbar();
    }));
    win.querySelectorAll('[data-max]').forEach(b=>b.addEventListener('click',(e)=>{
      e.stopPropagation();
      win.classList.toggle('maxed');
    }));
    makeDraggable(win, win.querySelector('.win-bar'));
  }

  // ---------- public popup window ----------
  function popWindow({title, ico, content, width=400, height=300}){
    const w=el('div',{class:'window',style:`width:${width}px;height:${height}px;left:${80+Math.random()*120}px;top:${40+Math.random()*60}px`});
    w.dataset.title=title||'window';
    w.innerHTML = `
      <div class="win-bar" data-drag>
        <div class="win-title"><span class="win-ico">${ico||'★'}</span><span class="win-name">${title||'window'}</span></div>
        <div class="win-btns">
          <button class="wb" data-min>_</button>
          <button class="wb" data-max>▢</button>
          <button class="wb close" data-close>×</button>
        </div>
      </div>
      <div class="win-body" style="padding:10px;overflow:auto;background:#fff;display:block"></div>`;
    const body = w.querySelector('.win-body');
    if (typeof content==='string') body.innerHTML = content;
    else if (content instanceof Node) body.appendChild(content);
    $('#windows').appendChild(w);
    wireWinControls(w);
    focusWindow(w);
    updateTaskbar();
    return w;
  }

  // ---------- buddy list (sidebar mini) ----------
  function refreshBuddies(users, me){
    const list = $('#buddyList'); if(!list)return;
    list.innerHTML='';
    if (!users||!users.length){ list.innerHTML='<span class="p-sub" style="padding:4px;display:block">no buddies yet</span>'; return;}
    users.filter(u=>!me||u.username!==me.username).slice(0,10).forEach(u=>{
      const on=Math.random()<.4; // fake online indicator since we have no presence — keep honesty: call out
      const row=el('div',{class:'buddy'+(on?'':' off')},[
        el('span',{class:'bud'}),
        el('span',{style:'font-size:11px'}, '@'+u.username+(on?'':' (off)'))
      ]);
      row.addEventListener('click',()=>window.FEED.route('profile',u.username));
      list.appendChild(row);
    });
    const discl=el('div',{style:'font-size:9px;color:#6938bf;padding:4px;font-family:var(--mono)'},'online status is random here');
    list.appendChild(discl);
  }

  // ---------- hook main win chrome ----------
  wireWinControls($('#mainWin'));
  // win menu tabs
  $$('#winMenu [data-view]').forEach(s=>{
    s.addEventListener('click',()=>window.FEED.route(s.dataset.view));
  });

  // ---------- init ----------
  function init(){
    buildDesktop();
    bindStartItems();
    bumpHits();
    // login/logout buttons in start menu
    $('#startLogin').addEventListener('click',()=>{window.OSP.openAuth();startMenu.classList.add('hidden');});
    $('#startLogout').addEventListener('click',async()=>{await api.logout();window.OSP.loggedOut();startMenu.classList.add('hidden');toast('logged out','good');window.FEED.route('home');});
    $('#startShut').addEventListener('click',async()=>{await api.logout();window.OSP.loggedOut();window.location.reload();});
    // welcome toast after boot
    setTimeout(()=>msnPop('ONLYSNACKPACK','welcome to reality (2008) — double click desktop icons ★','★'), 900);
    focusWindow($('#mainWin'));
    updateTaskbar();
  }

  window.WIN = { popWindow, refreshBuddies, msnPop, focusWindow, updateTaskbar, bumpHits };
  window.addEventListener('load', init);
})();
