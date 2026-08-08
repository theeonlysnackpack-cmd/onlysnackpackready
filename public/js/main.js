// ONLYSNACKPACK boot / main entry.
(function(){
  const { $, applySpotlight, applySettings, loadSettings, toast, el } = window.UI;

  const boot = $('#boot');
  const bootLine = $('#bootLine');
  const bootBar  = $('#bootBar');
  const bootBtn = $('#bootEnter');
  const shellEls = ['#taskbar','#desktop','#mainWin','#windows'];

  const bootLines = [
    'welcome to reality (2008)',
    'loading stickers…',
    'tuning CRT…',
    'warming the tubes…',
    'press enter.',
  ];
  let li = 0, prog=0;
  const cycle = setInterval(()=>{
    li = (li+1) % bootLines.length;
    bootLine.style.opacity=0;
    setTimeout(()=>{ bootLine.textContent=bootLines[li]; bootLine.style.opacity=1;},220);
  }, 1400);
  const bar=setInterval(()=>{prog=Math.min(100,prog+4+Math.random()*6);bootBar.style.width=prog+'%';if(prog>=100)clearInterval(bar);},110);

  function enterShell(){
    clearInterval(cycle); clearInterval(bar);
    bootLine.textContent = 'welcome to reality (2008)';
    boot.style.transition='opacity .6s';
    boot.style.opacity='0';
    setTimeout(()=>{
      boot.classList.add('hidden');
      shellEls.forEach(s=>$(s).classList.remove('hidden'));
      $('#mainWin').classList.remove('hidden');
      startShell();
    }, 500);
  }
  bootBtn.addEventListener('click', enterShell);
  window.addEventListener('keydown', function onKey(e){
    if(!boot.classList.contains('hidden') && e.key==='Enter'){
      window.removeEventListener('keydown',onKey);
      enterShell();
    }
  });

  async function startShell(){
    const cfg = loadSettings(); applySettings(cfg);
    if (localStorage.getItem('osp_spotlight')==='1'){
      applySpotlight(true);
      $('#spotCursor').classList.remove('hidden');
    }
    window.APPS.mountList();
    await window.FEED.init();
    const me = await api.me();
    if (me){ window.OSP.setStateMe(me); }
    window.FEED.route('home');
    if(!localStorage.getItem('osp_welcomed')){
      setTimeout(()=>toast('double-click the desktop icons ★','good'),1100);
      localStorage.setItem('osp_welcomed','1');
    }
    // tray spotlight sync
    if (document.body.classList.contains('spotmode')) $('#traySpot').textContent='☀';
  }
})();
