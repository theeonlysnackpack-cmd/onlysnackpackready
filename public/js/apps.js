// Temple TV — 50+ fully functional mini apps.
// Each app registers with APPS.reg({id, name, icon, tooltip, run(container, setTitle)}).
// run() receives the container element it must mount into. It should NOT render chrome
// (the shell handles that). Keep each one honest — actually does something.
(function(){
  const { $, el, bindTooltips } = window.UI;

  const APPS = [];
  const byId = {};

  function reg(app){
    if (!app.id || byId[app.id]) console.warn('duplicate app id',app.id);
    byId[app.id] = app;
    APPS.push(app);
  }

  function mountList(){
    const list = $('#appList');
    list.innerHTML = '';
    APPS.forEach(a=>{
      const b = el('button',{class:'side-item','data-app':a.id,'data-tooltip':a.tooltip||a.name},[
        el('span',{class:'si-ico'}, a.icon||'◉'),
        el('span',{class:'si-label'}, a.name),
      ]);
      b.addEventListener('click',()=>window.FEED.route('app', a.id));
      list.appendChild(b);
    });
    $('#appCount').textContent = String(APPS.length);
    bindTooltips(list);
  }

function setAppTitle(name, sub){
  const wn = document.getElementById('winName');
  const ws = document.getElementById('winSub');
  const ch = document.getElementById('tvCh');
  if (wn) wn.textContent = name;
  if (ws) ws.textContent = sub || 'onlysnackpack';
  if (ch) ch.textContent = 'CH-AP';
}
  // App lifecycle: intervals/timeouts/rAFs/AudioContexts created while an app is
  // active are tracked and auto-cleared when the user navigates away. Apps don't
  // need to clean up after themselves.
  const _si=window.setInterval, _st=window.setTimeout, _siC=window.clearInterval, _stC=window.clearTimeout;
  const _rAF=window.requestAnimationFrame, _cAF=window.cancelAnimationFrame;
  const _AC = window.AudioContext || window.webkitAudioContext;
  let appActive = false;
  let trackIntervals = new Set(), trackTimeouts = new Set(), trackRAFs = new Set(), trackACs=[];
  window.setInterval = function(fn,ms,...a){ const id=_si(fn,ms,...a); if(appActive) trackIntervals.add(id); return id; };
  window.setTimeout = function(fn,ms,...a){ const id=_st(fn,ms,...a); if(appActive) trackTimeouts.add(id); return id; };
  window.requestAnimationFrame = function(fn){
    const id=_rAF(function wrap(ts){ trackRAFs.delete(id); fn(ts); });
    trackRAFs.add(id);
    return id;
  };
  if (_AC){
    window.AudioContext = window.webkitAudioContext = function(){
      const ac=new _AC();
      if(appActive) trackACs.push(ac);
      return ac;
    };
  }

  function clearActiveApp(){
    if (trackIntervals) trackIntervals.forEach(i=>_siC(i));
    if (trackTimeouts) trackTimeouts.forEach(t=>_stC(t));
    if (trackRAFs) trackRAFs.forEach(id=>_cAF(id));
    if (trackACs) trackACs.forEach(ac=>{try{ac.close();}catch(e){}});
    const cbs = window._appCleanups || [];
    cbs.forEach(fn=>{try{fn();}catch(e){console.error(e);}});
    document.querySelectorAll('#screen audio, #screen video').forEach(m=>{try{m.pause();m.src='';}catch(e){}});
    trackIntervals = new Set(); trackTimeouts = new Set(); trackRAFs = new Set(); trackACs=[];
    window._appCleanups=[];
  }
  function onExit(fn){ (window._appCleanups = window._appCleanups||[]).push(fn); }

  function runApp(id, container){
    const app = byId[id];
    clearActiveApp();
    appActive = true;
    container.innerHTML = '<div class="loading">loading app…</div>';
    if (!app){ container.textContent = 'no such app'; appActive=false; return; }
    container.innerHTML = '';
    const wrap = el('div',{class:'appview'});
    const head = el('div',{class:'app-head'},[
      el('button',{class:'back',onclick:()=>{appActive=false;clearActiveApp();window.FEED.route('home');}},'◀ back'),
      el('h2',{}, app.name),
    ]);
    wrap.appendChild(head);
    const body = el('div',{class:'app-canvas-wrap'});
    wrap.appendChild(body);
    container.appendChild(wrap);
    setAppTitle(app.name, app.tooltip||'');
    try { app.run(body, (sub)=>setAppTitle(app.name, sub)); }
    catch(e){ body.textContent = 'app error: '+e.message; console.error(e); }
    if (typeof body._cleanup === 'function') onExit(body._cleanup);
    // when route changes away from 'app', clearActiveApp will be called by runApp
  }

  // make sure changing routes clears the active app
  window.addEventListener('hashchange',()=>{});

  // ---------- HELPERS for apps ----------
  function canvas2d(w,h){
    const c = el('canvas',{class:'game',width:w,height:h});
    const g = c.getContext('2d');
    return {c,g};
  }
  function readKey(){
    const keys = {};
    const down = e=>{ keys[e.key.toLowerCase()]=true; };
    const up = e=>{ keys[e.key.toLowerCase()]=false; };
    window.addEventListener('keydown',down);
    window.addEventListener('keyup',up);
    return {keys, destroy(){ window.removeEventListener('keydown',down); window.removeEventListener('keyup',up); }};
  }
  function hiKey(k, v){
    const kk = 'osp_hi_'+k;
    if (v!==undefined){
      const cur = parseInt(localStorage.getItem(kk)||'0',10);
      if (v>cur) localStorage.setItem(kk, String(v));
    }
    return parseInt(localStorage.getItem(kk)||'0',10);
  }

  // =================================================================
  //   50+ APPS
  // =================================================================

  // 1. Notepad
  reg({id:'notepad', name:'notepad', icon:'✎', tooltip:'a place to write, saved locally',
    run(body){
      const ta = el('textarea',{class:'notes',placeholder:'write your own reality here. saved on this device.'});
      ta.value = localStorage.getItem('osp_notepad')||'';
      ta.addEventListener('input',()=>localStorage.setItem('osp_notepad', ta.value));
      const clr = el('button',{class:'btn',onclick:()=>{if(confirm('clear?')){ta.value='';localStorage.removeItem('osp_notepad');}}},'clear');
      body.appendChild(ta);
      body.appendChild(el('div',{style:'margin-top:8px;text-align:right'}, clr));
    }});

  // 2. Todo list
  reg({id:'todo', name:'to-do list', icon:'✓', tooltip:'check things off. saved locally.',
    run(body){
      const list = el('div',{style:'border:1px solid var(--line2);border-radius:4px;background:#0d0d18'});
      const inp = el('input',{type:'text',placeholder:'add something to do…',style:'width:100%'});
      let items = JSON.parse(localStorage.getItem('osp_todo')||'[]');
      function redraw(){
        list.innerHTML='';
        items.forEach((it,i)=>{
          const row = el('div',{class:'todo-item'+(it.done?' done':'')},[
            el('input',{type:'checkbox',onchange:()=>{it.done=!it.done;save();redraw();}, ...(it.done?{checked:'checked'}:{})}),
            el('span',{class:'txt'}, it.text),
            el('button',{class:'tinybtn',style:'margin-left:auto',onclick:()=>{items.splice(i,1);save();redraw();}},'✕'),
          ]);
          list.appendChild(row);
        });
        if (!items.length) list.appendChild(el('div',{class:'p-sub',style:'padding:10px'},'nothing yet.'));
      }
      function save(){ localStorage.setItem('osp_todo',JSON.stringify(items)); }
      inp.addEventListener('keydown',e=>{
        if (e.key==='Enter' && inp.value.trim()){ items.push({text:inp.value.trim(),done:false}); inp.value=''; save(); redraw(); }
      });
      body.appendChild(inp);
      body.appendChild(el('div',{style:'height:6px'}));
      body.appendChild(list);
      redraw();
    }});

  // 3. Calculator
  reg({id:'calc', name:'calculator', icon:'≡', tooltip:'numbers and operations',
    run(body){
      const wrap = el('div',{class:'calc'});
      const scr = el('div',{class:'screen'}, '0');
      const keys = el('div',{class:'keys'});
      let expr='';
      function press(v){
        if (v==='C'){expr='';scr.textContent='0';return;}
        if (v==='='){
          try{
            // safe-ish eval of digits/ops
            if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error('bad');
            const val = Function('"use strict";return ('+expr+')')();
            scr.textContent = String(val);
            expr = String(val);
          }catch(e){ scr.textContent='err'; expr=''; }
          return;
        }
        expr += v;
        scr.textContent = expr || '0';
      }
      ['C','(',')','/', '7','8','9','*', '4','5','6','-', '1','2','3','+', '0','.','='].forEach(k=>{
        const b = el('button',{class:(/[+\-*/=]/.test(k)?'op':'')+(k==='='?' eq':''),onclick:()=>press(k)}, k);
        keys.appendChild(b);
      });
      wrap.appendChild(scr); wrap.appendChild(keys);
      body.appendChild(wrap);
    }});

  // 4. Clock
  reg({id:'clock', name:'big clock', icon:'◴', tooltip:'it is what time it is',
    run(body){
      const big = el('div',{class:'clock-big'},'00:00:00');
      const d = el('div',{style:'text-align:center;color:var(--muted);font-family:var(--mono);font-size:11px'});
      function tick(){
        const now=new Date();
        big.textContent = now.toLocaleTimeString();
        d.textContent = now.toDateString();
      }
      tick(); setInterval(tick,1000);
      body.appendChild(big); body.appendChild(d);
    }});

  // 5. Stopwatch
  reg({id:'stopwatch', name:'stopwatch', icon:'⏱', tooltip:'start, stop, lap',
    run(body){
      const disp = el('div',{class:'clock-big'},'00:00.00');
      const row = el('div',{style:'text-align:center;display:flex;gap:6px;justify-content:center'},[
        el('button',{class:'btn primary',id:'swtog'},'start'),
        el('button',{class:'btn',id:'swlap'},'lap'),
        el('button',{class:'btn danger',id:'swrst'},'reset'),
      ]);
      const laps = el('div',{style:'margin-top:10px;font-family:var(--mono);font-size:12px;color:var(--ink2)'});
      body.appendChild(disp); body.appendChild(row); body.appendChild(laps);
      let t=0,start=0,iv=null,running=false,lapn=0;
      function fmt(){
        const m=Math.floor(t/60000), s=Math.floor((t%60000)/1000), cs=Math.floor((t%1000)/10);
        disp.textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(cs).padStart(2,'0');
      }
      $('#swtog',row).onclick=()=>{
        running=!running;
        if (running){ start=Date.now()-t; iv=setInterval(()=>{t=Date.now()-start;fmt();},30); $('#swtog',row).textContent='stop'; }
        else {clearInterval(iv);$('#swtog',row).textContent='start';}
      };
      $('#swlap',row).onclick=()=>{if(!running&&!t)return;lapn++;const d=el('div',{},'lap '+lapn+' — '+disp.textContent);laps.prepend(d);};
      $('#swrst',row).onclick=()=>{running=false;clearInterval(iv);t=0;lapn=0;laps.innerHTML='';fmt();$('#swtog',row).textContent='start';};
      fmt();
    }});

  // 6. Timer
  reg({id:'timer', name:'countdown', icon:'◔', tooltip:'beeps when done',
    run(body){
      const disp = el('div',{class:'clock-big'},'00:00');
      const row = el('div',{style:'text-align:center;display:flex;gap:6px;justify-content:center'});
      const mins = el('input',{type:'number',value:'1',min:'0',max:'99',style:'width:70px'});
      const secs = el('input',{type:'number',value:'0',min:'0',max:'59',style:'width:70px'});
      const start = el('button',{class:'btn primary'},'start');
      const stopb = el('button',{class:'btn danger'},'stop');
      row.appendChild(el('span',{style:'align-self:center'},'min')); row.appendChild(mins);
      row.appendChild(el('span',{style:'align-self:center'},'sec')); row.appendChild(secs);
      row.appendChild(start); row.appendChild(stopb);
      body.appendChild(disp); body.appendChild(row);
      let iv=null,left=0;
      function fmt(){const m=Math.floor(left/60),s=left%60;disp.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
      function beep(){
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);
        o.frequency.value=880;g.gain.value=.2;o.start();
        setTimeout(()=>{o.frequency.value=660;},200);
        setTimeout(()=>{o.frequency.value=440;},400);
        setTimeout(()=>{o.stop();ctx.close();},800);
      }
      start.onclick=()=>{clearInterval(iv);left=(parseInt(mins.value)||0)*60+(parseInt(secs.value)||0);fmt();
        iv=setInterval(()=>{left--;fmt();if(left<=0){clearInterval(iv);disp.textContent='TIME';beep();}},1000);};
      stopb.onclick=()=>{clearInterval(iv);};
      fmt();
    }});

  // 7. Metronome
  reg({id:'met', name:'metronome', icon:'♩', tooltip:'click in time',
    run(body){
      const wrap=el('div',{class:'metronome'});
      const beat=el('div',{class:'beat'},'♩');
      const bpm=el('input',{type:'range',min:40,max:220,value:100});
      const bpmv=el('div',{style:'font-size:12px'},'100 bpm');
      const tog=el('button',{class:'btn primary'},'start');
      wrap.appendChild(beat);wrap.appendChild(bpm);wrap.appendChild(bpmv);wrap.appendChild(tog);
      body.appendChild(wrap);
      let iv=null,audio=null;
      bpm.oninput=()=>{bpmv.textContent=bpm.value+' bpm'; if(iv){clearInterval(iv);tick();}};
      function click(){
        if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)();
        const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);
        o.frequency.value=1200;g.gain.value=.3;o.start();g.gain.exponentialRampToValueAtTime(0.0001,audio.currentTime+0.05);
        o.stop(audio.currentTime+0.06);
        beat.style.color='var(--accent)';
        setTimeout(()=>beat.style.color='var(--accent2)',60);
      }
      function tick(){iv=setInterval(click, 60000/parseInt(bpm.value));}
      tog.onclick=()=>{if(iv){clearInterval(iv);iv=null;tog.textContent='start';}else{tick();tog.textContent='stop';}};
    }});

  // 8. Paint
  reg({id:'paint', name:'paint', icon:'▣', tooltip:'draw stuff, save as png',
    run(body){
      const {c,g} = canvas2d(640,400);
      g.fillStyle='#060610';g.fillRect(0,0,640,400);
      const wrap=el('div',{class:'paint-wrap'});
      const colors=['#fff','#ff5b5b','#ff6ec7','#ffea00','#c0ff00','#4aff8c','#7df9ff','#b388ff','#ffb347','#000'];
      const colsw=el('div',{class:'paint-colors'});
      let col='#fff',sz=4;
      colors.forEach(cl=>{
        const s=el('div',{class:'swatch'+(cl===col?' on':''),style:'background:'+cl,onclick:()=>{col=cl;$$('.swatch',colsw).forEach(x=>x.classList.remove('on'));s.classList.add('on');}});
        colsw.appendChild(s);
      });
      const size=el('input',{type:'range',min:1,max:40,value:4});
      size.oninput=()=>{sz=parseInt(size.value);};
      const clear=el('button',{class:'btn danger',onclick:()=>{g.fillStyle='#060610';g.fillRect(0,0,640,400);}},'clear');
      const save=el('button',{class:'btn primary',onclick:()=>{const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='osp-paint.png';a.click();}},'save png');
      const top=el('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},[colsw,size,clear,save]);
      wrap.appendChild(top);wrap.appendChild(c);
      let drawing=false;
      c.addEventListener('mousedown',e=>{drawing=true;const r=c.getBoundingClientRect();g.beginPath();g.moveTo((e.clientX-r.left)*(c.width/r.width),(e.clientY-r.top)*(c.height/r.height));});
      c.addEventListener('mousemove',e=>{if(!drawing)return;const r=c.getBoundingClientRect();g.lineCap='round';g.lineWidth=sz;g.strokeStyle=col;g.lineTo((e.clientX-r.left)*(c.width/r.width),(e.clientY-r.top)*(c.height/r.height));g.stroke();});
      window.addEventListener('mouseup',()=>drawing=false);
      body.appendChild(wrap);
    }});

  // 9. Color picker / mixer
  reg({id:'color', name:'color mixer', icon:'◐', tooltip:'rgb sliders, copy hex',
    run(body){
      const box=el('div',{style:'width:100%;height:120px;border:1px solid var(--line2);border-radius:4px;background:#ff0000;box-shadow:0 0 40px currentColor;color:#ff0000'});
      const hex=el('input',{type:'text',value:'#ff0000',readonly:'readonly',style:'width:120px;text-align:center;font-family:var(--mono);background:#000;color:#fff'});
      const mk = (lbl,initial,cb)=>{
        const lab=el('label',{},lbl);
        const sl=el('input',{type:'range',min:0,max:255,value:initial});
        sl.oninput=()=>cb(parseInt(sl.value));
        const row=el('div',{},[lab,sl]);body.appendChild(row);return sl;
      };
      body.appendChild(box);
      body.appendChild(el('div',{style:'text-align:center;margin:8px 0'},hex));
      let r=255,g=0,b=0;
      function upd(){const h='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');box.style.background=h;box.style.color=h;hex.value=h;}
      const rs=mk('R',255,v=>{r=v;upd();});
      const gs=mk('G',0,v=>{g=v;upd();});
      const bs=mk('B',0,v=>{b=v;upd();});
      hex.onclick=()=>{hex.select();document.execCommand('copy');window.UI.toast('copied','good');};
    }});

  // 10. Dice
  reg({id:'dice', name:'dice roller', icon:'⚅', tooltip:'roll 1-10 dice',
    run(body){
      const row=el('div',{style:'display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:10px'});
      const n=el('input',{type:'number',value:'2',min:'1',max:'10',style:'width:60px'});
      const btn=el('button',{class:'btn primary'},'roll');
      const out=el('div',{style:'font-size:60px;text-align:center;letter-spacing:10px;color:var(--accent);text-shadow:0 0 12px var(--accent);min-height:80px'});
      const sum=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--muted)'});
      row.appendChild(el('span',{},'dice'));row.appendChild(n);row.appendChild(btn);
      body.appendChild(row);body.appendChild(out);body.appendChild(sum);
      btn.onclick=()=>{
        const c=Math.max(1,Math.min(10,parseInt(n.value)||1));
        let total=0,faces=[];
        for(let i=0;i<c;i++){const v=1+Math.floor(Math.random()*6);total+=v;faces.push(['⚀','⚁','⚂','⚃','⚄','⚅'][v-1]);}
        out.textContent=faces.join(' ');sum.textContent='total: '+total;
      };
    }});

  // 11. Coin flip
  reg({id:'coin', name:'coin flip', icon:'○', tooltip:'heads or tails',
    run(body){
      const out=el('div',{style:'font-size:120px;text-align:center;margin:20px 0'},'?');
      const b=el('button',{class:'btn primary',style:'display:block;margin:0 auto'},'flip');
      body.appendChild(out);body.appendChild(b);
      b.onclick=()=>{out.style.animation='none';out.textContent='…';setTimeout(()=>{out.textContent=Math.random()<.5?'HEADS':'TAILS';out.style.cssText+='text-shadow:0 0 20px var(--accent);color:var(--accent)';},300);};
    }});

  // 12. Magic 8-ball
  reg({id:'eightball', name:'8-ball', icon:'◉', tooltip:'ask a yes/no question',
    run(body){
      const ball=el('div',{style:'width:200px;height:200px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#444,#000);margin:20px auto;display:flex;align-items:center;justify-content:center;color:#fff;font-size:60px;text-shadow:0 0 20px #7df9ff;font-family:var(--mono);cursor:pointer;box-shadow:inset -20px -20px 60px rgba(0,0,0,.8), 0 0 30px rgba(125,249,255,.2)'},'8');
      const inp=el('input',{type:'text',placeholder:'ask it anything…',style:'width:100%'});
      const ans=['it is certain','without a doubt','yes definitely','you may rely on it','most likely','outlook good','yes','signs point to yes','reply hazy, try again','ask again later','better not tell you now','cannot predict now','concentrate and ask again','don\'t count on it','my reply is no','my sources say no','outlook not so good','very doubtful'];
      body.appendChild(inp);body.appendChild(ball);
      ball.onclick=()=>{ball.textContent='…';setTimeout(()=>{ball.textContent=ans[Math.floor(Math.random()*ans.length)];ball.style.fontSize='14px';ball.style.textAlign='center';ball.style.padding='20px';},600);};
    }});

  // 13. Random name generator
  reg({id:'names', name:'name gen', icon:'☺', tooltip:'random screen names',
    run(body){
      const out=el('div',{style:'font-family:var(--mono);font-size:22px;text-align:center;letter-spacing:2px;color:var(--accent3);min-height:160px;padding:20px;border:1px dashed var(--line2);border-radius:4px;background:#0a0a14'});
      const b=el('button',{class:'btn primary',style:'display:block;margin:10px auto'},'generate');
      const a=['xXx','DJ','Lil','yung','xx','Mc','Supa','Neo','Kid','Da','phantom','DJ','glitched','pixel','cyber','zero','chrome','neon'];
      const n=['snackpack','raver','shadow','wolf','kitten','pixel','blade','ghost','phoenix','nova','storm','byte','static','vector','crystal','void','snack','packer'];
      b.onclick=()=>{out.innerHTML='';for(let i=0;i<12;i++){const nm=a[Math.floor(Math.random()*a.length)]+n[Math.floor(Math.random()*n.length)]+Math.floor(Math.random()*99);out.appendChild(el('div',{},nm));}};
      body.appendChild(out);body.appendChild(b);b.onclick();
    }});

  // 14. Password generator
  reg({id:'pwgen', name:'password gen', icon:'⚿', tooltip:'strong random password',
    run(body){
      const len=el('input',{type:'number',value:'16',min:'6',max:'64',style:'width:80px'});
      const out=el('input',{type:'text',style:'width:100%;font-family:var(--mono);background:#000;color:#7df9ff;text-align:center',readonly:'readonly'});
      const b=el('button',{class:'btn primary',style:'display:block;margin:8px auto'},'generate');
      const cs='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{};:,.<>?';
      b.onclick=()=>{let s='';for(let i=0;i<parseInt(len.value);i++)s+=cs[Math.floor(Math.random()*cs.length)];out.value=s;};
      body.appendChild(el('label',{},'length'));body.appendChild(len);body.appendChild(out);body.appendChild(b);b.onclick();
    }});

  // 15. Unit converter
  reg({id:'convert', name:'unit converter', icon:'↔', tooltip:'length/weight/temp',
    run(body){
      const cats={
        length:{units:['m','km','cm','mm','mi','yd','ft','in'],toM:{m:1,km:1000,cm:0.01,mm:0.001,mi:1609.34,yd:0.9144,ft:0.3048,in:0.0254}},
        weight:{units:['kg','g','mg','lb','oz'],toG:{kg:1000,g:1,mg:0.001,lb:453.592,oz:28.3495}},
        temp:{units:['C','F','K']}
      };
      const sel=el('select',{});Object.keys(cats).forEach(c=>sel.appendChild(el('option',{value:c},c)));
      const f=el('select',{}), t=el('select',{}), v=el('input',{type:'number',value:'1'});
      const res=el('div',{style:'font-family:var(--mono);color:var(--accent);font-size:22px;text-align:center;padding:20px'});
      function pop(){
        const c=sel.value; f.innerHTML='';t.innerHTML='';
        cats[c].units.forEach(u=>{f.appendChild(el('option',{value:u},u));t.appendChild(el('option',{value:u},u));});
        t.selectedIndex=1;
        conv();
      }
      function conv(){
        const c=sel.value,val=parseFloat(v.value)||0,fu=f.value,tu=t.value;
        let out=0;
        if (c==='length'){ out = val*cats.length.toM[fu]/cats.length.toM[tu]; }
        if (c==='weight'){ out = val*cats.weight.toG[fu]/cats.weight.toG[tu]; }
        if (c==='temp'){ let k=val; if(fu==='C')k=val+273.15;if(fu==='F')k=(val-32)*5/9+273.15;
          if(tu==='C')out=k-273.15;else if(tu==='F')out=(k-273.15)*9/5+32;else out=k; }
        res.textContent = val+' '+fu+' = '+out.toFixed(4)+' '+tu;
      }
      sel.onchange=pop;[f,t,v].forEach(x=>x.oninput=conv);
      body.appendChild(sel);body.appendChild(el('div',{class:'row',style:'margin-top:8px'},[v,f,el('span',{style:'align-self:center;text-align:center'},'→'),t]));
      body.appendChild(res);pop();
    }});

  // 16. Tip calculator
  reg({id:'tip', name:'tip calc', icon:'%', tooltip:'split the bill',
    run(body){
      const bill=el('input',{type:'number',value:'0',step:'0.01'});
      const tip=el('input',{type:'range',min:0,max:30,value:15});
      const ppl=el('input',{type:'number',value:'1',min:'1'});
      const out=el('div',{style:'font-family:var(--mono);font-size:14px;line-height:1.8'});
      function calc(){
        const b=parseFloat(bill.value)||0,t=parseInt(tip.value),p=Math.max(1,parseInt(ppl.value)||1);
        const tv=b*t/100, tot=b+tv, each=tot/p;
        out.innerHTML='';
        out.appendChild(el('div',{},'tip: $'+tv.toFixed(2)));
        out.appendChild(el('div',{},'total: $'+tot.toFixed(2)));
        out.appendChild(el('div',{style:'color:var(--accent);font-size:22px'},'each: $'+each.toFixed(2)));
      }
      [bill,tip,ppl].forEach(x=>x.oninput=calc);
      body.appendChild(el('label',{},'bill'));body.appendChild(bill);
      body.appendChild(el('label',{style:'margin-top:6px;display:block'},'tip %'));body.appendChild(tip);
      body.appendChild(el('label',{style:'margin-top:6px;display:block'},'people'));body.appendChild(ppl);
      body.appendChild(el('div',{style:'height:10px'}));body.appendChild(out);calc();
    }});

  // 17. Base converter
  reg({id:'base', name:'base converter', icon:'0x', tooltip:'bin/dec/hex',
    run(body){
      const inp=el('input',{type:'text',value:'42',style:'width:100%;font-family:var(--mono)'});
      const out=el('div',{style:'font-family:var(--mono);line-height:1.9'});
      function run(){
        let n;
        if (inp.value.startsWith('0x')) n=parseInt(inp.value,16);
        else if (inp.value.startsWith('0b')) n=parseInt(inp.value.slice(2),2);
        else n=parseInt(inp.value,10);
        if (isNaN(n)){out.textContent='invalid';return;}
        out.innerHTML='';
        out.appendChild(el('div',{},'bin: '+n.toString(2)));
        out.appendChild(el('div',{},'dec: '+n.toString(10)));
        out.appendChild(el('div',{},'hex: 0x'+n.toString(16).toUpperCase()));
        out.appendChild(el('div',{},'oct: 0o'+n.toString(8)));
      }
      inp.oninput=run;
      body.appendChild(el('label',{},'number (0x=hex, 0b=bin, else dec)'));body.appendChild(inp);
      body.appendChild(el('div',{style:'height:8px'}));body.appendChild(out);run();
    }});

  // 18. World clock
  reg({id:'world', name:'world clock', icon:'◷', tooltip:'time zones',
    run(body){
      const zones=['UTC','America/Los_Angeles','America/New_York','Europe/London','Europe/Paris','Asia/Tokyo','Asia/Shanghai','Australia/Sydney'];
      const wrap=el('div',{});
      function tick(){
        wrap.innerHTML='';
        zones.forEach(z=>{
          const t=new Date().toLocaleTimeString('en-US',{timeZone:z,hour12:false});
          wrap.appendChild(el('div',{class:'kv'},[el('span',{},z),el('span',{style:'color:var(--accent)'},t)]));
        });
      }
      tick();setInterval(tick,1000);
      body.appendChild(wrap);
    }});

  // 19. Calendar
  reg({id:'cal', name:'calendar', icon:'▦', tooltip:'month view',
    run(body){
      const d=new Date(), y=d.getFullYear(), m=d.getMonth();
      const mn=el('div',{style:'text-align:center;font-family:var(--mono);letter-spacing:2px;font-size:16px;color:var(--accent);margin-bottom:8px'},new Date(y,m,1).toLocaleString(undefined,{month:'long',year:'numeric'}));
      const grid=el('div',{style:'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-family:var(--mono);font-size:12px'});
      ['S','M','T','W','T','F','S'].forEach(x=>grid.appendChild(el('div',{style:'text-align:center;color:var(--muted);padding:4px'},x)));
      const first=new Date(y,m,1).getDay(); for(let i=0;i<first;i++) grid.appendChild(el('div',{}));
      const days=new Date(y,m+1,0).getDate(), today=new Date();
      for(let i=1;i<=days;i++){
        const isToday = (today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===i);
        grid.appendChild(el('div',{style:'text-align:center;padding:8px;border:1px solid '+(isToday?'var(--accent)':'var(--line2)')+';'+(isToday?'color:var(--accent);font-weight:bold;box-shadow:0 0 10px var(--accent)':'')},String(i)));
      }
      body.appendChild(mn);body.appendChild(grid);
    }});

  // 20. Countdown to date
  reg({id:'countdown2', name:'date countdown', icon:'⧖', tooltip:'how long until…',
    run(body){
      const inp=el('input',{type:'date'});
      const out=el('div',{style:'text-align:center;font-family:var(--mono);font-size:20px;color:var(--accent);padding:20px'});
      inp.oninput=()=>{
        const d=new Date(inp.value); if(!inp.value)return;
        const ms=d-Date.now();
        const days=Math.floor(ms/86400000), hrs=Math.floor((ms%86400000)/3600000), min=Math.floor((ms%3600000)/60000);
        out.textContent = ms<0? ('passed '+Math.abs(days)+'d ago') : (days+'d '+hrs+'h '+min+'m');
      };
      body.appendChild(el('label',{},'pick a date'));body.appendChild(inp);body.appendChild(out);
    }});

  // 21. Pomodoro
  reg({id:'pomo', name:'pomodoro', icon:'◉', tooltip:'25/5 focus timer',
    run(body){
      const disp=el('div',{class:'clock-big'},'25:00');
      const start=el('button',{class:'btn primary'},'start work');
      const mode=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--muted)'},'work');
      let iv=null,left=25*60,running=false,workMode=true;
      function fmt(){const m=Math.floor(left/60),s=left%60;disp.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
      start.onclick=()=>{
        if(running){clearInterval(iv);running=false;start.textContent='resume';return;}
        running=true;start.textContent='pause';
        iv=setInterval(()=>{left--;fmt();if(left<=0){clearInterval(iv);running=false;
          const ctx=new (window.AudioContext||window.webkitAudioContext)();
          const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.start();o.frequency.value=880;setTimeout(()=>o.stop(),300);ctx.close();
          workMode=!workMode;left=workMode?25*60:5*60;mode.textContent=workMode?'work':'break';start.textContent='start';fmt();}},1000);
      };
      body.appendChild(mode);body.appendChild(disp);body.appendChild(el('div',{style:'text-align:center'},start));fmt();
    }});

  // 22. BPM tap
  reg({id:'tap', name:'tap tempo', icon:'♫', tooltip:'tap to find bpm',
    run(body){
      const out=el('div',{class:'clock-big'},'tap');
      const b=el('button',{class:'btn primary',style:'display:block;margin:0 auto;font-size:20px;padding:20px 40px'},'TAP');
      let last=0,times=[];
      b.onclick=()=>{const n=Date.now();if(last)times.push(n-last);if(times.length>8)times.shift();last=n;
        if(times.length){const avg=times.reduce((a,b)=>a+b,0)/times.length;out.textContent=Math.round(60000/avg)+' bpm';}};
      const r=el('button',{class:'btn',style:'display:block;margin:10px auto'},'reset');r.onclick=()=>{times=[];last=0;out.textContent='tap';};
      body.appendChild(out);body.appendChild(b);body.appendChild(r);
    }});

  // 23. Tone/synth
  reg({id:'synth', name:'synth', icon:'♪', tooltip:'click keys to beep',
    run(body){
      const keys=[{n:'C',f:261.63},{n:'D',f:293.66},{n:'E',f:329.63},{n:'F',f:349.23},{n:'G',f:392.00},{n:'A',f:440.00},{n:'B',f:493.88},{n:'C2',f:523.25}];
      const wrap=el('div',{style:'display:flex;gap:4px;justify-content:center;padding:20px'});
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      keys.forEach(k=>{
        const b=el('button',{class:'btn',style:'width:50px;height:120px'},k.n);
        let o,g;
        b.onmousedown=()=>{o=ac.createOscillator();g=ac.createGain();o.type='square';o.frequency.value=k.f;o.connect(g);g.connect(ac.destination);g.gain.value=.1;o.start();b.style.background='var(--accent)';};
        b.onmouseup=()=>{if(o){o.stop();o.disconnect();g.disconnect();}b.style.background='';};
        b.onmouseleave=b.onmouseup;
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'hold down with mouse. this is a simple square-wave synth.'));
    }});

  // 24. Tone generator (freq slider)
  reg({id:'tone', name:'tone gen', icon:'∿', tooltip:'sine wave, any freq',
    run(body){
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.connect(g);g.connect(ac.destination);g.gain.value=0;
      o.start();
      const freq=el('input',{type:'range',min:20,max:2000,value:440});
      const fv=el('div',{style:'text-align:center;font-family:var(--mono)'},'440 Hz');
      const tog=el('button',{class:'btn'},'play');
      freq.oninput=()=>{o.frequency.value=parseInt(freq.value);fv.textContent=freq.value+' Hz';};
      tog.onclick=()=>{if(g.gain.value>.01){g.gain.value=0;tog.textContent='play';}else{g.gain.value=.15;tog.textContent='stop';}};
      const vol=el('input',{type:'range',min:0,max:.4,step:.01,value:.15});vol.oninput=()=>g.gain.value=parseFloat(vol.value);
      body.appendChild(fv);body.appendChild(freq);body.appendChild(el('div',{style:'text-align:center',},tog));
      body.appendChild(el('label',{style:'margin-top:8px;display:block'},'volume'));body.appendChild(vol);
    }});

  // 25. Wave visualizer (mic)
  reg({id:'wave', name:'mic visualizer', icon:'∿', tooltip:'look at your mic',
    async run(body){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        const ac=new (window.AudioContext||window.webkitAudioContext)();
        const src=ac.createMediaStreamSource(stream), an=ac.createAnalyser();an.fftSize=512;src.connect(an);
        const {c,g}=canvas2d(600,200);
        const data=new Uint8Array(an.frequencyBinCount);
        body.appendChild(c);
        (function loop(){
          an.getByteFrequencyData(data);
          g.fillStyle='rgba(10,10,19,.4)';g.fillRect(0,0,600,200);
          const w=600/data.length;
          for(let i=0;i<data.length;i++){const h=data[i]/255*200;g.fillStyle='hsl('+(i*2)+',80%,60%)';g.fillRect(i*w,200-h,w-1,h);}
          requestAnimationFrame(loop);
        })();
      }catch(e){ body.appendChild(el('div',{class:'notice'},'mic blocked or unavailable.')); }
    }});

  // 26. Pixel art editor (small canvas)
  reg({id:'pixel', name:'pixel art', icon:'▞', tooltip:'16x16 grid',
    run(body){
      const size=16,cs=20;
      const {c,g}=canvas2d(size*cs,size*cs);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){g.fillStyle=(x+y)%2?'#0b0b16':'#0e0e1c';g.fillRect(x*cs,y*cs,cs,cs);}
      const colors=['#ffffff','#ff5b5b','#ff6ec7','#ffea00','#c0ff00','#4aff8c','#7df9ff','#b388ff','#ffb347','#000000'];
      const cw=el('div',{class:'paint-colors'});let col='#fff';
      colors.forEach(cl=>{const s=el('div',{class:'swatch'+(cl===col?' on':''),style:'background:'+cl,onclick:()=>{col=cl;$$('.swatch',cw).forEach(x=>x.classList.remove('on'));s.classList.add('on');}});cw.appendChild(s);});
      const er=el('button',{class:'btn',onclick:()=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++){g.fillStyle=(x+y)%2?'#0b0b16':'#0e0e1c';g.fillRect(x*cs,y*cs,cs,cs);}}},'clear');
      const sv=el('button',{class:'btn primary',onclick:()=>{const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='osp-pixel.png';a.click();}},'save png');
      let draw=false;
      function paint(e){
        const r=c.getBoundingClientRect();
        const x=Math.floor((e.clientX-r.left)*(c.width/r.width)/cs), y=Math.floor((e.clientY-r.top)*(c.height/r.height)/cs);
        if(x<0||y<0||x>=size||y>=size)return;
        g.fillStyle=col;g.fillRect(x*cs,y*cs,cs,cs);
      }
      c.addEventListener('mousedown',e=>{draw=true;paint(e);});
      c.addEventListener('mousemove',e=>{if(draw)paint(e);});
      window.addEventListener('mouseup',()=>draw=false);
      body.appendChild(cw);body.appendChild(el('div',{style:'display:flex;gap:6px;margin:6px 0'},[er,sv]));body.appendChild(c);
    }});

  // 27. ASCII art
  reg({id:'ascii', name:'ascii art', icon:'▚', tooltip:'text-mode drawing',
    run(body){
      const cols=48,rows=20;
      const ta=el('textarea',{style:'width:100%;font-family:monospace;font-size:11px;line-height:1.2;background:#000;color:#7df9ff;height:320px;white-space:pre'});
      let s='';for(let r=0;r<rows;r++){s+=' '.repeat(cols)+'\n';}ta.value=s;
      const chars='█▓▒░╔╗╚╝║═╠╣╬┊┆│─·•◦▪▫';
      const chrow=el('div',{style:'display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;font-family:monospace'});
      [...chars].forEach(ch=>{const b=el('button',{class:'tinybtn',style:'font-size:14px;padding:4px 8px'},ch);b.onclick=()=>{ta.setRangeText(ch,ta.selectionStart,ta.selectionEnd,'end');ta.focus();};chrow.appendChild(b);});
      body.appendChild(chrow);body.appendChild(ta);
    }});

  // 28. Lorem ipsum
  reg({id:'lorem', name:'lorem gen', icon:'¶', tooltip:'placeholder text',
    run(body){
      const words='lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
      const n=el('input',{type:'number',value:'3',min:1,max:50});
      const out=el('div',{style:'border:1px solid var(--line2);background:#0a0a14;padding:10px;border-radius:4px;line-height:1.5;max-height:360px;overflow-y:auto'});
      function gen(){
        const p=Math.max(1,parseInt(n.value)||3);
        let o='';
        for(let i=0;i<p;i++){
          const len=30+Math.floor(Math.random()*40);
          let s=[];for(let j=0;j<len;j++)s.push(words[Math.floor(Math.random()*words.length)]);
          s[0]=s[0][0].toUpperCase()+s[0].slice(1);
          o+=s.join(' ')+'.\n\n';
        }
        out.textContent=o;
      }
      const b=el('button',{class:'btn primary',onclick:gen},'generate');
      body.appendChild(el('div',{class:'row'},[n,b]));body.appendChild(out);gen();
    }});

  // 29. Hangman
  reg({id:'hangman', name:'hangman', icon:'☠', tooltip:'guess the word',
    run(body){
      const words=['snackpack','reality','cyber','pixel','static','channel','broadcast','glitch','neon','cassette','sticker'];
      let word=words[Math.floor(Math.random()*words.length)], guesses=new Set(), bad=0, done=false;
      const disp=el('div',{style:'font-family:var(--mono);font-size:30px;letter-spacing:8px;text-align:center;color:var(--accent)'});
      const art=el('pre',{style:'text-align:center;color:var(--bad);font-size:12px;line-height:1.2;min-height:120px'},'');
      const kbd=el('div',{style:'display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin-top:10px'});
      const msg=el('div',{style:'text-align:center;font-family:var(--mono);margin-top:6px'});
      function frame(n){const a=['  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========','  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========','  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========','  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========','  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========','  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========','  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n========='];return a[n];}
      function render(){
        let shown='';for(const ch of word)shown+=guesses.has(ch)?ch+' ':'_ ';
        disp.textContent=shown;art.textContent=frame(bad);
        if (!shown.includes('_')){done=true;msg.textContent='you won';msg.style.color='var(--good)';}
        if (bad>=6){done=true;msg.textContent='word was '+word;msg.style.color='var(--bad)';}
      }
      for(let i=0;i<26;i++){const ch=String.fromCharCode(97+i);const b=el('button',{class:'tinybtn',style:'padding:6px 8px'},ch);b.onclick=()=>{if(done||guesses.has(ch))return;guesses.add(ch);if(!word.includes(ch))bad++;b.disabled=true;b.style.opacity=.4;render();};kbd.appendChild(b);}
      const again=el('button',{class:'btn',onclick:()=>{body.innerHTML='';regHangman();}},'again');
      function regHangman(){return window.APPS && window.APPS.byId && window.APPS.byId.hangman.run(body);}
      body.appendChild(art);body.appendChild(disp);body.appendChild(kbd);body.appendChild(msg);body.appendChild(el('div',{style:'text-align:center;margin-top:8px'},again));
      render();
    }});

  // 30. Tic-tac-toe (vs cpu)
  reg({id:'ttt', name:'tic-tac-toe', icon:'×', tooltip:'vs a dumb cpu',
    run(body){
      const board=Array(9).fill(null), hu='X',ai='O';
      const grid=el('div',{style:'display:grid;grid-template-columns:repeat(3,80px);gap:4px;justify-content:center;margin:20px auto'});
      const stat=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--accent)'});
      function win(b){const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(const l of lines){const [a,b2,c]=l;if(b[a]&&b[a]===b[b2]&&b[a]===b[c])return b[a];}return b.every(x=>x)?'draw':null;}
      function aimove(){const w=win(board);if(w||board.every(x=>x))return;let ch=board.findIndex(x=>!x);for(let i=0;i<9;i++){if(!board[i]){board[i]=ai;if(win(board)===ai){ch=i;board[i]=null;break;}board[i]=null;}}for(let i=0;i<9;i++){if(!board[i]){board[i]=hu;if(win(board)===hu){ch=i;board[i]=null;break;}board[i]=null;}}board[ch]=ai;render();}
      function render(){grid.innerHTML='';board.forEach((v,i)=>{const cell=el('button',{class:'btn',style:'width:80px;height:80px;font-size:30px;font-family:var(--mono)'},v||'');cell.onclick=()=>{if(board[i]||win(board))return;board[i]=hu;render();setTimeout(aimove,200);};grid.appendChild(cell);});const w=win(board);stat.textContent= w?(w==='draw'?'draw':w+' wins'):'your turn (X)';}
      const r=el('button',{class:'btn',onclick:()=>{for(let i=0;i<9;i++)board[i]=null;render();},style:'display:block;margin:10px auto'},'reset');
      body.appendChild(grid);body.appendChild(stat);body.appendChild(r);render();
    }});

  // 31. Rock paper scissors
  reg({id:'rps', name:'rock paper scissors', icon:'✊', tooltip:'best of five',
    run(body){
      const out=el('div',{style:'text-align:center;font-size:60px;margin:20px'},'?  VS  ?');
      const score=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--muted)'},'you 0 — 0 cpu');
      const row=el('div',{style:'display:flex;gap:6px;justify-content:center;margin-top:10px'});
      const opts=[['✊','rock'],['✋','paper'],['✌','scissors']];
      let ys=0,cs=0;
      opts.forEach(([g,n])=>{const b=el('button',{class:'btn'},g+' '+n);b.onclick=()=>{const c=opts[Math.floor(Math.random()*3)];out.textContent=g+'  VS  '+c[0];let r;if(g===c[0])r='tie';else if((g==='✊'&&c[0]==='✌')||(g==='✋'&&c[0]==='✊')||(g==='✌'&&c[0]==='✋')){r='win';ys++;}else {r='lose';cs++;}score.textContent='you '+ys+' — '+cs+' cpu ('+r+')';if(ys===3||cs===3){score.textContent+=' — match over';ys=0;cs=0;}};row.appendChild(b);});
      body.appendChild(out);body.appendChild(score);body.appendChild(row);
    }});

  // 32. Simon says
  reg({id:'simon', name:'simon', icon:'◉', tooltip:'memory sequence',
    run(body){
      const pads=[{c:'#ff5b5b',f:329},{c:'#4aff8c',f:261},{c:'#7df9ff',f:392},{c:'#ffea00',f:523}];
      const grid=el('div',{style:'display:grid;grid-template-columns:120px 120px;gap:8px;justify-content:center;margin:20px'});
      const stat=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--accent)'},'press start');
      const btn=el('button',{class:'btn primary',style:'display:block;margin:10px auto'},'start');
      const bs=[];
      let seq=[],pos=0,playing=false;
      const ac=new (window.AudioContext||window.webkitAudioContext)();
      function beep(f,d){const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(ac.destination);g.gain.value=.2;o.start();setTimeout(()=>{g.gain.value=0;o.stop();},d);}
      pads.forEach((p,i)=>{const b=el('button',{style:'width:120px;height:120px;border-radius:6px;border:2px solid #000;background:'+p.c+';box-shadow:0 0 10px '+p.c+';opacity:.6;cursor:pointer'});
        b.onclick=()=>{if(!playing)return;b.style.opacity='1';beep(p.f,200);setTimeout(()=>b.style.opacity='.6',200);
          if(seq[pos]===i){pos++;if(pos===seq.length){stat.textContent='round '+seq.length;setTimeout(nextRound,700);}}
          else {stat.textContent='failed at '+seq.length;playing=false;seq=[];}};
        bs.push(b);grid.appendChild(b);});
      function flash(i){return new Promise(res=>{bs[i].style.opacity='1';beep(pads[i].f,300);setTimeout(()=>{bs[i].style.opacity='.6';setTimeout(res,200);},400);});}
      async function playSeq(){for(const i of seq)await flash(i);}
      function nextRound(){seq.push(Math.floor(Math.random()*4));pos=0;stat.textContent='watch…';playSeq().then(()=>{stat.textContent='repeat!';});}
      btn.onclick=()=>{playing=true;seq=[];nextRound();};
      body.appendChild(grid);body.appendChild(stat);body.appendChild(btn);
    }});

  // 33. Memory match
  reg({id:'memory', name:'memory match', icon:'▦', tooltip:'pair the cards',
    run(body){
      const syms=['♥','♦','♣','♠','♪','✦','☀','☁','◉','▲','▼','★'];
      const deck=syms.slice(0,8).flatMap(x=>[x,x]).sort(()=>Math.random()-.5);
      const grid=el('div',{style:'display:grid;grid-template-columns:repeat(4,80px);gap:6px;justify-content:center;margin:16px auto'});
      let open=[],done=0,moves=0;
      const mv=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--muted)'},'moves: 0');
      deck.forEach((s,i)=>{const c=el('button',{class:'btn',style:'width:80px;height:80px;font-size:28px;color:transparent'},s);c.onclick=()=>{if(c.dataset.o||open.length>=2)return;c.style.color='var(--accent)';c.dataset.o='1';open.push({c,s});if(open.length===2){moves++;mv.textContent='moves: '+moves;if(open[0].s===open[1].s){open=[];done+=2;if(done===deck.length)mv.textContent='done in '+moves+'!';}else{setTimeout(()=>{open.forEach(o=>{o.c.style.color='transparent';delete o.c.dataset.o;});open=[];},700);}}};grid.appendChild(c);});
      body.appendChild(grid);body.appendChild(mv);
    }});

  // 34. 2048-lite (4x4)
  reg({id:'g2048', name:'2048 lite', icon:'▣', tooltip:'arrow keys merge',
    run(body){
      let b=Array(16).fill(0);function add(){const e=b.map((v,i)=>v?null:i).filter(x=>x!==null);if(!e.length)return;b[e[Math.floor(Math.random()*e.length)]]=Math.random()<.9?2:4;}
      const grid=el('div',{style:'display:grid;grid-template-columns:repeat(4,70px);gap:6px;justify-content:center;padding:10px;background:#1a1a2a;border-radius:6px;width:304px;margin:16px auto'});
      const scoreEl=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--accent)'},'score: 0');
      function render(){grid.innerHTML='';b.forEach(v=>{const c=el('div',{style:'width:70px;height:70px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:bold;border-radius:4px;background:'+(v?'hsl('+(Math.log2(v)*30)+',70%,'+(70-Math.log2(v)*4)+'%)':'#222')+';color:'+(v>4?'#fff':'#000')},v||'');grid.appendChild(c);});scoreEl.textContent='score: '+b.reduce((a,x)=>a+x,0);}
      function slide(row){let r=row.filter(x=>x);for(let i=0;i<r.length-1;i++)if(r[i]===r[i+1]){r[i]*=2;r[i+1]=0;}r=r.filter(x=>x);while(r.length<4)r.push(0);return r;}
      function move(d){
        let rotated=b.slice();if(d==='left')rotated=rotated;if(d==='right')rotated=rotated.reverse();
        // rows/cols. keep simple: do rows, map indices
        const nb=new Array(16).fill(0);
        if (d==='left'||d==='right'){
          for(let r=0;r<4;r++){let row=b.slice(r*4,r*4+4);if(d==='right')row.reverse();row=slide(row);if(d==='right')row.reverse();for(let i=0;i<4;i++)nb[r*4+i]=row[i];}
        } else {
          for(let c=0;c<4;c++){let col=[b[c],b[c+4],b[c+8],b[c+12]];if(d==='down')col.reverse();col=slide(col);if(d==='down')col.reverse();nb[c]=col[0];nb[c+4]=col[1];nb[c+8]=col[2];nb[c+12]=col[3];}
        }
        if (nb.join(',')!==b.join(',')){b=nb;add();render();if(b.every(x=>x)&&!movesLeft())scoreEl.textContent='game over';}
      }
      function movesLeft(){for(let r=0;r<4;r++)for(let c=0;c<4;c++){const i=r*4+c;if(c<3&&b[i]===b[i+1])return true;if(r<3&&b[i]===b[i+4])return true;}return false;}
      const {destroy} = (()=>{const kd=e=>{if(['arrowleft','arrowright','arrowup','arrowdown'].includes(e.key.toLowerCase())){e.preventDefault();move(e.key.toLowerCase().replace('arrow',''));}};window.addEventListener('keydown',kd);return{destroy:()=>window.removeEventListener('keydown',kd)};})();
      const rst=el('button',{class:'btn',onclick:()=>{b=Array(16).fill(0);add();add();render();},style:'display:block;margin:0 auto'},'new game');
      body.appendChild(scoreEl);body.appendChild(grid);body.appendChild(rst);body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'arrow keys'));
      add();add();render();
      body._cleanup = destroy;
    }});

  // 35. Reaction test
  reg({id:'react', name:'reaction test', icon:'⚡', tooltip:'click when it turns green',
    run(body){
      const pad=el('div',{style:'width:100%;height:200px;background:#ff5b5b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);color:#fff;font-size:20px;cursor:pointer;transition:background .1s'},'wait for green…');
      const res=el('div',{style:'text-align:center;margin-top:10px;font-family:var(--mono);color:var(--accent)'},'');
      let t0=0,tm=null,armed=false;
      function start(){pad.style.background='#ff5b5b';pad.textContent='wait for green…';armed=false;clearTimeout(tm);tm=setTimeout(()=>{pad.style.background='#4aff8c';pad.textContent='CLICK!';armed=true;t0=performance.now();}, 1000+Math.random()*3000);}
      pad.onclick=()=>{if(!armed && pad.style.background!=='rgb(74, 255, 140)'){if(pad.textContent==='wait for green…'){res.textContent='too early';clearTimeout(tm);pad.style.background='#111';pad.textContent='click to start over';}else start();return;}const t=Math.round(performance.now()-t0);res.textContent=t+' ms — best: '+Math.min(parseInt(res.dataset.best||'9999'),t);res.dataset.best=Math.min(parseInt(res.dataset.best||'9999'),t);armed=false;pad.style.background='#111';pad.textContent='click to go again';};
      body.appendChild(pad);body.appendChild(res);start();
    }});

  // 36. Aim trainer (click targets)
  reg({id:'aim', name:'aim trainer', icon:'◉', tooltip:'click 30 dots asap',
    run(body){
      const area=el('div',{style:'position:relative;width:100%;height:360px;background:#060610;border:1px solid var(--line2);border-radius:4px;overflow:hidden;cursor:crosshair'});
      const stat=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--accent);padding:6px'},'click to start');
      let running=false,hits=0,start=0,dot=null;
      function spawn(){if(dot)dot.remove();dot=el('button',{style:'position:absolute;width:28px;height:28px;border-radius:50%;background:var(--accent2);border:0;cursor:crosshair;box-shadow:0 0 10px var(--accent2)'});dot.style.left=(10+Math.random()*(area.clientWidth-50))+'px';dot.style.top=(10+Math.random()*(area.clientHeight-50))+'px';dot.onclick=()=>{hits++;if(hits>=30){running=false;const t=((performance.now()-start)/1000).toFixed(2);stat.textContent='done in '+t+'s — '+(30/t*1000).toFixed(0)+'ms / target';dot.remove();return;}spawn();};area.appendChild(dot);}
      area.onclick=(e)=>{if(!running){running=true;hits=0;start=performance.now();spawn();stat.textContent='hit 30!';}};
      body.appendChild(stat);body.appendChild(area);
    }});

  // 37. Typing test
  reg({id:'typing', name:'typing test', icon:'⌨', tooltip:'wpm test',
    run(body){
      const samples=['the quick brown fox jumps over the lazy dog near the riverbank while the sun sets over the old factory roof reality is what you make of it','packers pack light but pack hard never let a snack go to waste and always carry a spare cassette for the long night drive through neon streets','pixel by pixel we built the world one line at a time one glitch at a time keep it simple keep it real make it yours and do not blink because it moves fast'];
      const target=el('div',{style:'font-family:var(--mono);font-size:15px;line-height:1.6;padding:10px;background:#0a0a14;border:1px solid var(--line2);border-radius:4px;min-height:80px'});
      const inp=el('input',{type:'text',placeholder:'start typing…',style:'width:100%;margin-top:8px'});
      const res=el('div',{style:'text-align:center;font-family:var(--mono);color:var(--accent);margin-top:6px'},'');
      let sample=samples[Math.floor(Math.random()*samples.length)],start=0;
      function render(){target.innerHTML='';[...sample].forEach((ch,i)=>{const s=el('span',{},ch);if(i<inp.value.length)s.style.color=inp.value[i]===ch?'var(--good)':'var(--bad)';if(i===inp.value.length)s.style.background='var(--accent)';target.appendChild(s);});}
      inp.oninput=()=>{if(!start)start=performance.now();render();if(inp.value===sample){const t=(performance.now()-start)/60000;res.textContent='wpm: '+Math.round((sample.split(' ').length)/t)+' — time: '+(((performance.now()-start)/1000).toFixed(1))+'s';inp.value='';sample=samples[Math.floor(Math.random()*samples.length)];start=0;render();}};
      body.appendChild(target);body.appendChild(inp);body.appendChild(res);render();
    }});

  // 38. Number guess
  reg({id:'guess', name:'number guess', icon:'?', tooltip:'1–100',
    run(body){
      let n=1+Math.floor(Math.random()*100),g=0;
      const out=el('div',{class:'clock-big',style:'font-size:30px',},'guess 1-100');
      const inp=el('input',{type:'number',min:1,max:100});
      const btn=el('button',{class:'btn primary'},'guess');
      const hist=el('div',{style:'font-family:var(--mono);color:var(--muted);text-align:center;margin-top:6px'});
      btn.onclick=()=>{const v=parseInt(inp.value);g++;if(!v)return;if(v===n){out.textContent='got it in '+g+'!';out.style.color='var(--good)';n=1+Math.floor(Math.random()*100);g=0;}else{out.textContent= v<n?'higher':'lower';out.style.color='var(--accent2)';}hist.textContent='tries: '+g;};
      const rst=el('button',{class:'btn',onclick:()=>{n=1+Math.floor(Math.random()*100);g=0;out.textContent='guess 1-100';out.style.color='';hist.textContent='';inp.value='';}},'reset');
      body.appendChild(out);body.appendChild(el('div',{class:'row'},[inp,btn]));body.appendChild(hist);body.appendChild(el('div',{style:'text-align:center;margin-top:6px'},rst));
    }});

  // 39. Coin pusher clicker
  reg({id:'clicker', name:'coin clicker', icon:'○', tooltip:'click for coins',
    run(body){
      let c=parseInt(localStorage.getItem('osp_clicker')||'0'),ps=1;
      const disp=el('div',{class:'clock-big',style:'font-size:50px'},'◯ '+c);
      const b=el('button',{class:'btn primary',style:'display:block;margin:10px auto;padding:16px 30px;font-size:18px'},'DROP COIN');
      const up=el('button',{class:'btn',style:'display:block;margin:10px auto'},'buy +1/click (cost 50)');
      b.onclick=()=>{c+=ps;disp.textContent='◯ '+c;localStorage.setItem('osp_clicker',c);};
      up.onclick=()=>{if(c>=50){c-=50;ps+=1;localStorage.setItem('osp_clicker',c);disp.textContent='◯ '+c;toast('upgraded','good');}else toast('need 50','bad');};
      const rst=el('button',{class:'btn danger',style:'display:block;margin:6px auto;font-size:10px'},'wipe save');rst.onclick=()=>{c=0;ps=1;localStorage.removeItem('osp_clicker');disp.textContent='◯ 0';};
      body.appendChild(disp);body.appendChild(b);body.appendChild(up);body.appendChild(rst);
    }});

  // 40. Drawing stencil shapes
  reg({id:'shapes', name:'spirograph', icon:'❀', tooltip:'trippy shapes',
    run(body){
      const {c,g}=canvas2d(600,400);
      let R=150,r=60,d=80,t=0;
      const cR=el('input',{type:'range',min:30,max:180,value:150}),cr=el('input',{type:'range',min:10,max:120,value:60}),cd=el('input',{type:'range',min:10,max:150,value:80});
      [cR,cr,cd].forEach(s=>s.oninput=()=>{R=+cR.value;r=+cr.value;d=+cd.value;t=0;g.fillStyle='rgba(10,10,19,.3)';g.fillRect(0,0,600,400);});
      const reset=el('button',{class:'btn',onclick:()=>{g.fillStyle='#060610';g.fillRect(0,0,600,400);}},'clear');
      body.appendChild(el('div',{class:'row',style:'font-size:10px;color:var(--muted)'},[el('div',{},'R'),el('div',{},'r'),el('div',{},'d')]));
      body.appendChild(el('div',{class:'row'},[cR,cr,cd]));
      body.appendChild(el('div',{style:'text-align:center'},reset));
      body.appendChild(c);
      g.fillStyle='#060610';g.fillRect(0,0,600,400);
      function loop(){
        for(let i=0;i<50;i++){
          const a=t/20;
          const x=300+(R-r)*Math.cos(a)+d*Math.cos((R-r)/r*a);
          const y=200+(R-r)*Math.sin(a)-d*Math.sin((R-r)/r*a);
          g.fillStyle='hsl('+(t%360)+',80%,60%)';g.fillRect(x,y,2,2);
          t++;
        }
        requestAnimationFrame(loop);
      }loop();
    }});

  // 41. Starfield
  reg({id:'stars', name:'starfield', icon:'✦', tooltip:'warp speed',
    run(body){
      const {c,g}=canvas2d(600,400);
      const stars=Array.from({length:200},()=>({x:(Math.random()-.5)*600,y:(Math.random()-.5)*400,z:Math.random()*600}));
      function loop(){
        g.fillStyle='rgba(0,0,0,.3)';g.fillRect(0,0,600,400);
        stars.forEach(s=>{
          s.z-=8;if(s.z<1){s.x=(Math.random()-.5)*600;s.y=(Math.random()-.5)*400;s.z=600;}
          const k=128/s.z, x=300+s.x*k,y=200+s.y*k, r=Math.max(.2,(1-s.z/600)*2);
          g.fillStyle='hsl('+(s.z/3)+',80%,'+(80-s.z/10)+'%)';g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
        });
        requestAnimationFrame(loop);
      }loop();
      body.appendChild(c);
    }});

  // 42. Plasma / fractal-ish
  reg({id:'plasma', name:'plasma', icon:'▩', tooltip:'swirly colors',
    run(body){
      const {c,g}=canvas2d(300,200);
      const img=g.createImageData(300,200);
      let t=0;
      function loop(){
        for(let y=0;y<200;y++)for(let x=0;x<300;x++){
          const v=Math.sin(x/20+t)+Math.sin(y/15+t*1.1)+Math.sin((x+y)/25+t*.7)+Math.sin(Math.hypot(x-150,y-100)/20-t);
          const c=Math.floor((v+4)/8*255);
          const i=(y*300+x)*4;
          img.data[i]=c;img.data[i+1]=255-c;img.data[i+2]=(c+128)%256;img.data[i+3]=255;
        }
        g.putImageData(img,0,0);
        t+=0.05;requestAnimationFrame(loop);
      }loop();
      c.style.width='600px';c.style.height='400px';c.style.imageRendering='pixelated';
      body.appendChild(c);
    }});

  // 43. Fireworks
  reg({id:'fw', name:'fireworks', icon:'✺', tooltip:'click to launch',
    run(body){
      const {c,g}=canvas2d(600,400);
      const parts=[];
      function launch(x,y){
        const hue=Math.floor(Math.random()*360);
        for(let i=0;i<60;i++){const a=Math.random()*Math.PI*2,s=Math.random()*4+1;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:60+Math.random()*30,hue});}
      }
      c.addEventListener('click',e=>{const r=c.getBoundingClientRect();launch(e.clientX-r.left,e.clientY-r.top);});
      function loop(){
        g.fillStyle='rgba(0,0,0,.2)';g.fillRect(0,0,600,400);
        parts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.05;p.life--;g.fillStyle='hsl('+p.hue+',80%,'+(p.life/2)+'%)';g.fillRect(p.x,p.y,2,2);});
        for(let i=parts.length-1;i>=0;i--)if(parts[i].life<=0)parts.splice(i,1);
        requestAnimationFrame(loop);
      }loop();
      body.appendChild(c);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'click anywhere to launch'));
    }});

  // 44. Matrix rain
  reg({id:'matrix', name:'rain', icon:'▒', tooltip:'code rain',
    run(body){
      const {c,g}=canvas2d(600,400);
      const cols=60,ys=Array(cols).fill(0);
      g.fillStyle='#000';g.fillRect(0,0,600,400);
      function loop(){
        g.fillStyle='rgba(0,0,0,.08)';g.fillRect(0,0,600,400);
        g.fillStyle='#7df9ff';g.font='12px monospace';
        for(let i=0;i<cols;i++){const ch=String.fromCharCode(0x30a0+Math.random()*96);g.fillText(ch,i*10,ys[i]*12);if(ys[i]*12>400&&Math.random()>.975)ys[i]=0;ys[i]++;}
        requestAnimationFrame(loop);
      }loop();
      body.appendChild(c);
    }});

  // 45. Bouncing balls physics
  reg({id:'balls', name:'bouncy balls', icon:'◉', tooltip:'gravity wells',
    run(body){
      const {c,g}=canvas2d(600,400);
      const balls=Array.from({length:40},()=>({x:Math.random()*600,y:Math.random()*400,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,r:4+Math.random()*10,c:'hsl('+Math.floor(Math.random()*360)+',80%,60%)'}));
      function loop(){
        g.fillStyle='rgba(6,6,16,.3)';g.fillRect(0,0,600,400);
        balls.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.vy+=.15;if(b.x<b.r||b.x>600-b.r)b.vx*=-.9;if(b.y>400-b.r){b.y=400-b.r;b.vy*=-.8;}g.fillStyle=b.c;g.beginPath();g.arc(b.x,y,b.r,0,Math.PI*2);g.fill();});
        requestAnimationFrame(loop);
      }loop();
      body.appendChild(c);
    }});

  // 46. White noise
  reg({id:'noise', name:'white noise', icon:'▓', tooltip:'static (sound)',
    run(body){
      let ac,node;const b=el('button',{class:'btn primary'},'start static');b.onclick=()=>{
        if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();const buffer=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=buffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;node=ac.createBufferSource();node.buffer=buffer;node.loop=true;const g=ac.createGain();g.gain.value=.1;node.connect(g);g.connect(ac.destination);node.start();b.textContent='stop';}else{node.stop();ac.close();ac=null;b.textContent='start static';}};
      const tv=el('div',{style:'height:200px;background:repeating-linear-gradient(0deg,#000,#111 2px,#000 4px);border-radius:4px;margin-bottom:10px;animation:bars .2s infinite'});
      body.appendChild(tv);body.appendChild(el('div',{style:'text-align:center'},b));
    }});

  // 47. White noise VIDEO (static screen) - visual
  reg({id:'static', name:'tv static', icon:'▓', tooltip:'visual static',
    run(body){
      const {c,g}=canvas2d(400,300);c.style.width='100%';c.style.imageRendering='pixelated';
      function loop(){const d=g.createImageData(400,300);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}g.putImageData(d,0,0);requestAnimationFrame(loop);}loop();
      body.appendChild(c);
    }});

  // 48. Dream journal (local)
  reg({id:'dreams', name:'dream log', icon:'☾', tooltip:'save dreams, dated',
    run(body){
      const key='osp_dreams';
      const list=el('div',{style:'max-height:320px;overflow-y:auto;border:1px solid var(--line2);border-radius:4px;padding:8px;background:#0a0a14'});
      const ta=el('textarea',{placeholder:'what happened?'});
      const add=el('button',{class:'btn primary',onclick:()=>{if(!ta.value.trim())return;const j=JSON.parse(localStorage.getItem(key)||'[]');j.unshift({t:Date.now(),text:ta.value.trim()});localStorage.setItem(key,JSON.stringify(j));ta.value='';redraw();}},'save');
      function redraw(){list.innerHTML='';const j=JSON.parse(localStorage.getItem(key)||'[]');if(!j.length){list.appendChild(el('div',{class:'p-sub'},'no dreams logged.'));}j.forEach((d,i)=>{const it=el('div',{style:'border-bottom:1px dashed #222;padding:6px 0'},[el('div',{class:'p-sub'},new Date(d.t).toLocaleString()),el('div',{},d.text),el('button',{class:'tinybtn',onclick:()=>{j.splice(i,1);localStorage.setItem(key,JSON.stringify(j));redraw();}},'delete')]);list.appendChild(it);});}
      body.appendChild(ta);body.appendChild(el('div',{style:'text-align:right;margin:6px 0'},add));body.appendChild(list);redraw();
    }});

  // 49. Mood tracker
  reg({id:'mood', name:'mood ring', icon:'◉', tooltip:'log how you feel',
    run(body){
      const moods=[['😐','meh','#888'],['☺','good','#4aff8c'],['♥','great','#ff6ec7'],['⚡','amped','#ffea00'],['☁','meh+','#7d9'],['☠','bad','#ff5b5b']];
      // replace the first with a non-emoji glyph per user request "i dont like the emjois"
      moods[0][0]='◔'; moods[1][0]='◡'; moods[2][0]='♥'; moods[3][0]='⚡'; moods[4][0]='☁'; moods[5][0]='✕';
      const row=el('div',{style:'display:flex;gap:6px;justify-content:center;margin:10px 0'});
      const log=el('div',{style:'border:1px solid var(--line2);background:#0a0a14;border-radius:4px;padding:6px;max-height:260px;overflow-y:auto'});
      moods.forEach(([g,n,col])=>{const b=el('button',{class:'btn',style:'font-size:22px;color:'+col+';border-color:'+col},g);b.title=n;b.onclick=()=>{const j=JSON.parse(localStorage.getItem('osp_mood')||'[]');j.push({t:Date.now(),n});localStorage.setItem('osp_mood',JSON.stringify(j));redraw();};row.appendChild(b);});
      function redraw(){log.innerHTML='';const j=JSON.parse(localStorage.getItem('osp_mood')||'[]').slice(-30).reverse();j.forEach(m=>log.appendChild(el('div',{class:'kv'},[el('span',{},new Date(m.t).toLocaleString()),el('span',{},m.n)])));}
      body.appendChild(row);body.appendChild(log);redraw();
    }});

  // 50. Poll maker (local)
  reg({id:'poll', name:'poll maker', icon:'▀', tooltip:'create a quick poll',
    run(body){
      const q=el('input',{type:'text',placeholder:'poll question'});
      const opts=el('textarea',{placeholder:'one option per line'});
      const results=el('div',{style:'margin-top:10px'});
      const b=el('button',{class:'btn primary',onclick:()=>{
        const lines=opts.value.split('\n').map(x=>x.trim()).filter(Boolean);if(!q.value.trim()||lines.length<2)return;
        results.innerHTML='';
        const counts=lines.map(()=>0);
        const rq=el('div',{style:'font-family:var(--mono);font-weight:bold;margin-bottom:8px;color:var(--accent)'},q.value);
        results.appendChild(rq);
        lines.forEach((t,i)=>{
          const row=el('div',{style:'margin:4px 0'});
          const bar=el('div',{style:'display:flex;align-items:center;gap:6px'},[
            el('button',{class:'btn',onclick:()=>{counts[i]++;red();}},t),
            el('div',{class:'p-sub',style:'width:40px'},'0'),
            el('div',{style:'flex:1;height:8px;background:#111;border-radius:2px;overflow:hidden'},el('div',{style:'height:100%;width:0%;background:var(--accent);transition:width .3s'})),
          ]);
          row.appendChild(bar);results.appendChild(row);
        });
        function red(){const tot=counts.reduce((a,b)=>a+b,0);$$('.p-sub',results).forEach((n,i)=>{n.textContent=String(counts[i]);n.nextSibling.firstChild.style.width=((tot?counts[i]/tot:0)*100)+'%';});}
      }},'create poll');
      body.appendChild(el('label',{},'question'));body.appendChild(q);
      body.appendChild(el('label',{style:'margin-top:6px;display:block'},'options (one per line)'));body.appendChild(opts);
      body.appendChild(el('div',{style:'text-align:right;margin-top:6px'},b));
      body.appendChild(results);
    }});

  // 51. QR-like code generator (visual pattern encoding text)
  reg({id:'qr', name:'pixel code', icon:'▣', tooltip:'turn text into a square pattern (not a real qr, but visually yours)',
    run(body){
      const {c,g}=canvas2d(256,256);
      const inp=el('input',{type:'text',value:'onlysnackpack',style:'width:100%'});
      function draw(){
        const size=32, cs=8;
        g.fillStyle='#fff';g.fillRect(0,0,256,256);
        let h=0;for(const ch of inp.value)h=((h<<5)-h)+ch.charCodeAt(0)|0;
        function rand(x,y){let n=(h^x*374761393^y*668265263)|0;n=(n^(n>>>13))*1274126177;return ((n^(n>>>16))>>>0)/4294967296;}
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){g.fillStyle=rand(x,y)>.5?'#000':'#fff';g.fillRect(x*cs,y*cs,cs,cs);}
        // finder corners
        [[0,0],[0,size-7],[size-7,0]].forEach(([ox,oy])=>{g.fillStyle='#000';g.fillRect(ox*cs,oy*cs,7*cs,7*cs);g.fillStyle='#fff';g.fillRect((ox+1)*cs,(oy+1)*cs,5*cs,5*cs);g.fillStyle='#000';g.fillRect((ox+2)*cs,(oy+2)*cs,3*cs,3*cs);});
      }
      inp.oninput=draw;
      body.appendChild(el('label',{},'text'));body.appendChild(inp);body.appendChild(el('div',{style:'text-align:center;margin-top:10px'},c));draw();
    }});

  // 52. Horoscope
  reg({id:'horo', name:'daily horoscope', icon:'☀', tooltip:'for entertainment only, obviously',
    run(body){
      const signs=['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
      const verbs=['try to','beware of','expect','you will','avoid','a stranger will','remember to','a friend will'];
      const nouns=['glitch in the static','a cold beverage','a forgotten song','a pixel you missed','the color cyan','the number 7','a small snack','a lucky break','a long walk','old passwords','unread messages','a neon sign'];
      const sel=el('select',{});signs.forEach(s=>sel.appendChild(el('option',{value:s},s)));
      const out=el('div',{class:'notice',style:'margin-top:10px;font-size:13px;line-height:1.6'});
      function gen(){const v=verbs[Math.floor(Math.random()*verbs.length)],n=nouns[Math.floor(Math.random()*nouns.length)],n2=nouns[Math.floor(Math.random()*nouns.length)];out.textContent=sel.value+': '+v+' '+n+'. also, keep an eye out for '+n2+'. lucky color: hsl('+Math.floor(Math.random()*360)+',80%,60%).';}
      sel.onchange=gen;
      body.appendChild(sel);body.appendChild(out);gen();
    }});

  // 53. Decision maker (wheel)
  reg({id:'wheel', name:'wheel of decide', icon:'◔', tooltip:'spins to a choice you give',
    run(body){
      const inp=el('textarea',{placeholder:'one choice per line'});
      const spin=el('button',{class:'btn primary'},'spin the wheel');
      const out=el('div',{class:'clock-big',style:'font-size:26px'},'—');
      spin.onclick=()=>{const opts=inp.value.split('\n').map(x=>x.trim()).filter(Boolean);if(!opts.length)return;let i=0;const iv=setInterval(()=>{out.textContent=opts[i%opts.length];i++;},60);setTimeout(()=>{clearInterval(iv);out.textContent=opts[Math.floor(Math.random()*opts.length)];out.style.color='var(--accent3)';}, 1200+Math.random()*800);out.style.color='var(--ink)';};
      body.appendChild(inp);body.appendChild(el('div',{style:'text-align:center;margin:6px 0'},spin));body.appendChild(out);
    }});

  // 54. Markdown preview
  reg({id:'md', name:'markdown preview', icon:'¶', tooltip:'write md, see html',
    run(body){
      const ta=el('textarea',{placeholder:'# hi\n\nsome **bold** and *italic* and [links](https://example.com)'});
      const prev=el('div',{style:'border:1px solid var(--line2);background:#0a0a14;border-radius:4px;padding:10px;min-height:160px;line-height:1.5'});
      function render(){
        let s=ta.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        s=s.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>');
        s=s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>').replace(/`([^`]+)`/g,'<code style="background:#111;padding:1px 4px;border-radius:2px;font-family:var(--mono)">$1</code>');
        s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>');
        s=s.replace(/\n/g,'<br>');
        prev.innerHTML=s;
      }
      ta.oninput=render;
      body.appendChild(el('div',{class:'col-2',style:'align-items:stretch'},[ta,prev]));
      ta.value='# hello\n\nthis is **real** markdown-lite. write a `code` bit or a [link](https://example.com).';
      render();
    }});

  // 55. Binary clock
  reg({id:'binclock', name:'binary clock', icon:'01', tooltip:'bcd time',
    run(body){
      const {c,g}=canvas2d(240,140);
      function draw(){
        const d=new Date();const parts=[d.getHours(),d.getMinutes(),d.getSeconds()];
        g.fillStyle='#000';g.fillRect(0,0,240,140);
        parts.forEach((v,col)=>{const tens=Math.floor(v/10), ones=v%10;[tens,ones].forEach((n,k)=>{for(let bit=0;bit<4;bit++){const on=n&(1<<(3-bit));g.fillStyle=on?'var(--accent)':'#222';g.fillRect(20+col*70+k*30, 20+bit*28, 20,20);}});});
        requestAnimationFrame(draw);
      }draw();
      body.appendChild(el('div',{style:'text-align:center'},c));
    }});

  // export
  window.APPS = { reg, runApp, mountList, clearActiveApp, onExit };
  window.APPS.byId = byId;
})();
