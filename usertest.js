// Simulate a real user journey.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
const errors=[];
const vc = new VirtualConsole();
vc.on('jsdomError', e=>errors.push(e.message));
['log','info','warn','error'].forEach(k=>vc.on(k,()=>{}));
const dom = new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost:3000/'});
const {window} = dom;
// stubs
window.AudioContext = window.webkitAudioContext = function(){this.createOscillator=()=>({connect(){},start(){},stop(){},frequency:{value:0},type:'sine'});this.createGain=()=>({connect(){},gain:{value:0}});this.createAnalyser=()=>({connect(){},fftSize:512,getByteFrequencyData(){}});this.createMediaStreamSource=()=>({connect(){}});this.destination={};this.currentTime=0;this.sampleRate=44100;this.close=()=>{};this.createBuffer=()=>({getChannelData:()=>new Float32Array(1024)})};
window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(t,p)=>typeof p==='string'&&'fillRect,arc,fillText,beginPath,moveTo,lineTo,closePath,stroke,fill,drawImage,clearRect,putImageData,createImageData,fillStyle,strokeStyle,lineWidth,font,globalAlpha,save,restore,translate,rotate,scale'.includes(p)?()=>0:0});
window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);
window.cancelAnimationFrame=id=>clearTimeout(id);
window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
window.HTMLMediaElement.prototype.pause=()=>{};
window.navigator.mediaDevices={getUserMedia:()=>Promise.reject(new Error('no media'))};
window.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]},clear(){this._d={}}};
window.sessionStorage=Object.create(window.localStorage);
window.fetch=async(url,opts={})=>{
  // minimal fake server
  let body={};
  if (opts.body && typeof opts.body==='string') body=JSON.parse(opts.body);
  return {json:async()=>({users:[],posts:[],comments:[],communities:[],music:[],entries:[],posts:[],user:null})};
};
window.innerWidth=1200;window.innerHeight=800;
window.HTMLElement.prototype.scrollIntoView=()=>{};
window.alert=()=>{};window.confirm=()=>true;
const {document}=window;
window.getComputedStyle=()=>({getPropertyValue:()=>''});
// stub document.execCommand
document.execCommand=()=>{};
// scripts
for (const s of ['api.js','ui.js','windows.js','feed.js','apps.js','games.js','main.js']){
  const src = fs.readFileSync(path.join(__dirname,'public/js',s),'utf8');
  window.eval(src);
}
// Simulate user actions
function click(id){ const el=window.document.getElementById(id); if(!el)throw new Error('no '+id); el.dispatchEvent(new window.Event('click',{bubbles:true})); }
function hasClass(id,c){ return window.document.getElementById(id).classList.contains(c); }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
(async ()=>{
  try{
    // 1. boot enter -> shell (wait for enterShell timeout)
    click('bootEnter');
    await sleep(800);
    if (window.document.getElementById('mainWin').classList.contains('hidden')) errors.push('mainWin still hidden after boot');
    if (window.document.getElementById('taskbar').classList.contains('hidden')) errors.push('taskbar hidden after boot');
    if (window.document.getElementById('desktop').classList.contains('hidden')) errors.push('desktop hidden after boot');
    // 2. open auth modal
    window.document.getElementById('startLogin').click();
    await sleep(50);
    if (window.document.getElementById('modalRoot').classList.contains('hidden')) errors.push('modal did not open');
    // close modal via close button (not backdrop)
    window.document.querySelector('#modalBox [data-close]').dispatchEvent(new window.Event('click',{bubbles:true}));
    await sleep(50);
    if (!window.document.getElementById('modalRoot').classList.contains('hidden')) errors.push('modal did not close');
    // 3. start menu
    window.document.getElementById('startBtn').click();
    if (window.document.getElementById('startMenu').classList.contains('hidden')) errors.push('start menu hidden');
    window.document.getElementById('startBtn').click(); // close
    // 4. new post button (logged out -> should open auth)
    window.document.getElementById('newPostBtn').click();
    await sleep(50);
    if (window.document.getElementById('modalRoot').classList.contains('hidden')) errors.push('new post as guest should open auth modal');
    window.document.querySelector('#modalBox [data-close]').click();
    await sleep(50);
    // 5. click sidebar views
    window.document.querySelectorAll('.side-item[data-view]').forEach(b=>b.click());
    // 6. click new community button (should open auth)
    window.document.getElementById('newCommunityBtn').click();
    await sleep(50);
    window.document.querySelector('#modalBox [data-close]').click();
    await sleep(50);
    // 7. toggle spotlight
    window.document.getElementById('traySpot').click();
    if (!window.document.body.classList.contains('spotmode')) errors.push('spotlight did not toggle');
    window.document.getElementById('traySpot').click();
    if (window.document.body.classList.contains('spotmode')) errors.push('spotlight did not toggle off');
    // 8. mount all 59 apps
    if (!window.APPS) errors.push('APPS not defined');
    else {
      const n = Object.keys(window.APPS.byId).length;
      if (n<50) errors.push('expected 50+ apps, got '+n);
    }
    // 9. windows.js exports
    if (typeof window.WIN !== 'object') errors.push('WIN not defined');
    if (typeof window.OSP !== 'object') errors.push('OSP not defined');
  }catch(e){
    errors.push('user journey: '+e.stack);
  }
  await sleep(100);
  console.log('errors:',errors.length);
  errors.forEach(e=>console.log('-',e));
  process.exit(errors.length?1:0);
})();
