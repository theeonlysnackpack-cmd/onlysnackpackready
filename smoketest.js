// Simulate page load and check for runtime errors.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e=>errors.push('jsdomError: '+ (e.message||e.detail)));
['log','info','warn','error','debug','trace'].forEach(k=>vc.on(k,()=>{}));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'http://localhost:3000/'
});
const { window } = dom;
// Stub missing APIs that jsdom doesn't provide
window.AudioContext = window.webkitAudioContext = function(){
  this.createOscillator=()=>({connect(){},start(){},stop(){},frequency:{value:0},type:''});
  this.createGain=()=>({connect(){},gain:{value:0}});
  this.createBufferSource=()=>({connect(){},start(){},stop(){},buffer:null});
  this.createAnalyser=()=>({connect(){},fftSize:512,getByteFrequencyData(){}});
  this.createMediaStreamSource=()=>({connect(){}});
  this.destination={};
  this.currentTime=0;
  this.sampleRate=44100;
  this.close=()=>{};
  this.createBuffer=()=>{return {getChannelData:()=>new Float32Array(1024)};};
};
window.HTMLCanvasElement.prototype.getContext=function(type){
  return new Proxy({},{get:()=>(t=>typeof t==='number'?0:()=>{})});
};
if (!window.requestAnimationFrame) window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);
if (!window.cancelAnimationFrame) window.cancelAnimationFrame=id=>clearTimeout(id);
// stubs for file/input
window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
window.HTMLMediaElement.prototype.pause=()=>{};
window.navigator.mediaDevices={getUserMedia:()=>Promise.reject(new Error('no camera'))};
window.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]},clear(){this._d={}}}
window.sessionStorage=Object.create(window.localStorage);
window.fetch=async()=>({json:async()=>({}),text:async()=>''});
// minimal window
window.innerWidth=1200;window.innerHeight=800;
// mock scrollIntoView etc
window.HTMLElement.prototype.scrollIntoView=function(){};
window.alert=()=>{};window.confirm=()=>true;
// load scripts in order
const scripts = ['api.js','ui.js','windows.js','feed.js','apps.js','games.js','main.js'];
for (const s of scripts){
  try{
    const src = fs.readFileSync(path.join(__dirname,'public/js',s),'utf8');
    window.eval(src);
    console.log('loaded',s);
  }catch(e){
    errors.push('script '+s+': '+e.stack);
  }
}
// wait a tick
setTimeout(()=>{
  console.log('---errors---');
  errors.forEach(e=>console.log(e));
  console.log('total errors:',errors.length);
  process.exit(errors.length?1:0);
},500);
