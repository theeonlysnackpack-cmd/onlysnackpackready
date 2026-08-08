// A small handful of real arcade-style games. Kept compact but genuinely playable.
(function(){
  const { el } = window.UI;
  function canvas2d(w,h){
    const c = el('canvas',{class:'game',width:w,height:h});
    return {c,g:c.getContext('2d')};
  }
  function hi(k,v){const kk='osp_hi_'+k; if(v!==undefined){const cur=parseInt(localStorage.getItem(kk)||'0',10);if(v>cur)localStorage.setItem(kk,String(v));}return parseInt(localStorage.getItem(kk)||'0',10);}
  function keyTracker(){
    const keys={};
    const d=e=>{keys[e.key.toLowerCase()]=true;};
    const u=e=>{keys[e.key.toLowerCase()]=false};
    window.addEventListener('keydown',d);window.addEventListener('keyup',u);
    return {keys,destroy(){window.removeEventListener('keydown',d);window.removeEventListener('keyup',u);}};
  }

  // ---- SNAKE ----
  window.APPS.reg({id:'snake', name:'snake', icon:'~', tooltip:'arrow keys / wasd, eat the blocks',
    run(body){
      const W=40,H=30,CS=14;
      const {c,g}=canvas2d(W*CS,H*CS);
      const hiEl = el('div',{class:'hiscore'},'best: '+hi('snake'));
      const scoreEl = el('div',{class:'score'},'score: 0');
      body.appendChild(hiEl);body.appendChild(c);body.appendChild(scoreEl);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'arrows or WASD'));
      let snake,dir,ndir,food,score,alive,iv;
      function reset(){
        snake=[{x:20,y:15},{x:19,y:15},{x:18,y:15}];dir={x:1,y:0};ndir={x:1,y:0};score=0;alive=true;place();scoreEl.textContent='score: 0';
      }
      function place(){food={x:Math.floor(Math.random()*W),y:Math.floor(Math.random()*H)};if(snake.some(s=>s.x===food.x&&s.y===food.y))place();}
      function tick(){
        dir=ndir;
        const nx=snake[0].x+dir.x, ny=snake[0].y+dir.y;
        if(nx<0||ny<0||nx>=W||ny>=H||snake.some(s=>s.x===nx&&s.y===ny)){alive=false;clearInterval(iv);hi('snake',score);hiEl.textContent='best: '+hi('snake');scoreEl.textContent='game over — click to restart';c.style.cursor='pointer';return;}
        snake.unshift({x:nx,y:ny});
        if (nx===food.x&&ny===food.y){score++;scoreEl.textContent='score: '+score;place();}else snake.pop();
        g.fillStyle='#060610';g.fillRect(0,0,W*CS,H*CS);
        g.fillStyle='#ff6ec7';g.fillRect(food.x*CS+2,food.y*CS+2,CS-4,CS-4);
        snake.forEach((s,i)=>{g.fillStyle=i?'#7df9ff':'#c0ff00';g.fillRect(s.x*CS+1,s.y*CS+1,CS-2,CS-2);});
        // grid
        g.strokeStyle='rgba(255,255,255,0.03)';for(let x=0;x<=W;x++){g.beginPath();g.moveTo(x*CS,0);g.lineTo(x*CS,H*CS);g.stroke();}for(let y=0;y<=H;y++){g.beginPath();g.moveTo(0,y*CS);g.lineTo(W*CS,y*CS);g.stroke();}
      }
      const k=keyTracker();
      const kd=e=>{
        const key=e.key.toLowerCase();
        if((key==='arrowup'||key==='w')&&dir.y!==1)ndir={x:0,y:-1};
        if((key==='arrowdown'||key==='s')&&dir.y!==-1)ndir={x:0,y:1};
        if((key==='arrowleft'||key==='a')&&dir.x!==1)ndir={x:-1,y:0};
        if((key==='arrowright'||key==='d')&&dir.x!==-1)ndir={x:1,y:0};
      };
      window.addEventListener('keydown',kd);
      c.addEventListener('click',()=>{if(!alive){clearInterval(iv);reset();c.style.cursor='';iv=setInterval(tick,90);}});
      reset();iv=setInterval(tick,90);
      body._cleanup=()=>{clearInterval(iv);k.destroy();window.removeEventListener('keydown',kd);};
    }});

  // ---- BREAKOUT ----
  window.APPS.reg({id:'breakout', name:'breakout', icon:'▭', tooltip:'mouse or arrows to move paddle',
    run(body){
      const W=600,H=420;
      const {c,g}=canvas2d(W,H);
      const hiEl = el('div',{class:'hiscore'},'best: '+hi('breakout'));
      const scoreEl = el('div',{class:'score'},'lives: 3 · score: 0 · level: 1');
      body.appendChild(hiEl);body.appendChild(c);body.appendChild(scoreEl);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'mouse or arrows'));
      let paddle,ball,bricks,lives,score,lvl,iv;
      function init(l){
        lvl=l;bricks=[];const rows=5+Math.min(3,l),cols=10;
        for(let r=0;r<rows;r++)for(let cc=0;cc<cols;cc++)bricks.push({x:cc*56+20,y:40+r*22,w:52,h:18,hue:(r*50+l*20)%360,alive:true});
        paddle={x:W/2-50,y:H-24,w:100,h:10};
        ball={x:W/2,y:H-40,vx:3,vy:-3,r:6};
      }
      function resetBall(){ball.x=W/2;ball.y=H-40;ball.vx=3*(Math.random()<.5?-1:1);ball.vy=-3;}
      lives=3;score=0;init(1);
      const k=keyTracker();
      c.addEventListener('mousemove',e=>{const r=c.getBoundingClientRect();paddle.x=Math.max(0,Math.min(W-paddle.w,(e.clientX-r.left)*(W/r.width)-paddle.w/2));});
      function step(){
        if(k.keys['arrowleft'])paddle.x-=8;if(k.keys['arrowright'])paddle.x+=8;paddle.x=Math.max(0,Math.min(W-paddle.w,paddle.x));
        ball.x+=ball.vx;ball.y+=ball.vy;
        if(ball.x<ball.r||ball.x>W-ball.r)ball.vx*=-1;
        if(ball.y<ball.r)ball.vy*=-1;
        if(ball.y>H+20){lives--;scoreEl.textContent='lives: '+lives+' · score: '+score+' · level: '+lvl;if(lives<=0){clearInterval(iv);scoreEl.textContent='game over — click to replay';c.style.cursor='pointer';return;}resetBall();}
        if(ball.y+ball.r>=paddle.y&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w&&ball.vy>0){ball.vy*=-1;ball.vx+=(ball.x-(paddle.x+paddle.w/2))/20;}
        bricks.forEach(b=>{
          if(!b.alive)return;
          if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){
            b.alive=false;ball.vy*=-1;score+=10;scoreEl.textContent='lives: '+lives+' · score: '+score+' · level: '+lvl;
            if(bricks.every(x=>!x.alive)){lvl++;init(lvl);scoreEl.textContent='lives: '+lives+' · score: '+score+' · level: '+lvl;}
          }
        });
        g.fillStyle='#060610';g.fillRect(0,0,W,H);
        bricks.forEach(b=>{if(!b.alive)return;g.fillStyle='hsl('+b.hue+',80%,55%)';g.fillRect(b.x,b.y,b.w,b.h);g.strokeStyle='rgba(0,0,0,.4)';g.strokeRect(b.x,b.y,b.w,b.h);});
        g.fillStyle='#7df9ff';g.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);
        g.fillStyle='#fff';g.beginPath();g.arc(ball.x,ball.y,ball.r,0,Math.PI*2);g.fill();
      }
      c.addEventListener('click',()=>{if(lives<=0){lives=3;score=0;init(1);c.style.cursor='';iv=setInterval(step,1000/60);scoreEl.textContent='lives: '+lives+' · score: '+score+' · level: '+lvl;}});
      iv=setInterval(step,1000/60);
      body._cleanup=()=>{clearInterval(iv);k.destroy();};
    }});

  // ---- PONG (vs cpu) ----
  window.APPS.reg({id:'pong', name:'pong', icon:'▯', tooltip:'classic vs cpu',
    run(body){
      const W=600,H=360;const {c,g}=canvas2d(W,H);
      const hiEl=el('div',{class:'hiscore'},'best: '+hi('pong'));
      const scoreEl=el('div',{class:'score'},'you 0 — 0 cpu');
      body.appendChild(hiEl);body.appendChild(c);body.appendChild(scoreEl);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'mouse or up/down arrows'));
      let py=H/2-40, cy=H/2-40, bx=W/2, by=H/2, bvx=4, bvy=3;
      let ps=0,cs=0;
      const k=keyTracker();
      function reset(d){bx=W/2;by=H/2;bvx=4*d;bvy=(Math.random()-.5)*6;}
      c.addEventListener('mousemove',e=>{const r=c.getBoundingClientRect();py=(e.clientY-r.top)*(H/r.height)-40;});
      function step(){
        if(k.keys['arrowup']) py-=10;
        if(k.keys['arrowdown']) py+=10;
        py=Math.max(0,Math.min(H-80,py));
        // cpu tracks ball with some imperfection
        const target = by - 40 + (Math.random()-.5)*20;
        if(cy<target) cy+=Math.min(4,target-cy);
        else cy-=Math.min(4,cy-target);
        cy=Math.max(0,Math.min(H-80,cy));
        bx+=bvx;by+=bvy;
        if(by<6||by>H-6) bvy*=-1;
        if(bx<20&&by>py&&by<py+80&&bvx<0){bvx=Math.abs(bvx)*1.06;bvy+=(by-(py+40))/25;}
        if(bx>W-20&&by>cy&&by<cy+80&&bvx>0){bvx=-Math.abs(bvx)*1.06;bvy+=(by-(cy+40))/25;}
        if(bx<0){cs++;reset(1);}
        if(bx>W){ps++;reset(-1);hi('pong',ps);hiEl.textContent='best: '+hi('pong');}
        scoreEl.textContent='you '+ps+' — '+cs+' cpu';
        bvx=Math.max(-12,Math.min(12,bvx));bvy=Math.max(-10,Math.min(10,bvy));
        g.fillStyle='#000';g.fillRect(0,0,W,H);
        g.strokeStyle='rgba(255,255,255,.15)';
        for(let y=0;y<H;y+=20){g.beginPath();g.moveTo(W/2,y);g.lineTo(W/2,y+10);g.stroke();}
        g.fillStyle='#fff';
        g.fillRect(8,py,10,80);
        g.fillRect(W-18,cy,10,80);
        g.fillRect(bx-4,by-4,8,8);
      }
      const iv=setInterval(step,1000/60);
      body._cleanup=()=>{clearInterval(iv);k.destroy();};
    }});

  // ---- SPACE INVADERS ----
  window.APPS.reg({id:'invaders', name:'invaders', icon:'▼', tooltip:'arrows to move, space to shoot',
    run(body){
      const W=600,H=420;const {c,g}=canvas2d(W,H);
      const hiEl=el('div',{class:'hiscore'},'best: '+hi('invaders'));
      const scoreEl=el('div',{class:'score'},'score: 0 · lives: 3');
      body.appendChild(hiEl);body.appendChild(c);body.appendChild(scoreEl);
      body.appendChild(el('div',{class:'p-sub',style:'text-align:center'},'← → or A/D move, space to shoot'));
      let px=W/2,buls=[],ebuls=[],aliens=[],dir=1,speed=1,lastShot=0,score=0,lives=3,alive=true,iv;
      function spawn(){aliens=[];for(let r=0;r<4;r++)for(let cc=0;cc<10;cc++)aliens.push({x:40+cc*45,y:40+r*32,alive:true,kind:r});}
      spawn();
      const k=keyTracker();
      function shoot(){if(Date.now()-lastShot<300)return;lastShot=Date.now();buls.push({x:px,y:H-40,vy:-8});}
      function eshoot(a){ebuls.push({x:a.x+15,y:a.y+20,vy:4});}
      function step(){
        if(k.keys['arrowleft']||k.keys['a'])px-=5;if(k.keys['arrowright']||k.keys['d'])px+=5;
        px=Math.max(10,Math.min(W-30,px));
        if(k.keys[' '])shoot();
        // move aliens
        let edge=false;
        aliens.forEach(a=>{if(!a.alive)return;if(a.x+30>W&&dir>0||a.x<10&&dir<0)edge=true;});
        if(edge){dir*=-1;aliens.forEach(a=>a.y+=10);}
        aliens.forEach(a=>{if(a.alive)a.x+=dir*speed;if(a.alive&&a.y>H-60)alive=false;});
        if(Math.random()<0.02){const liv=aliens.filter(a=>a.alive);if(liv.length)eshoot(liv[Math.floor(Math.random()*liv.length)]);}
        buls.forEach(b=>b.y+=b.vy);ebuls.forEach(b=>b.y+=b.vy);
        buls=buls.filter(b=>b.y>0);ebuls=ebuls.filter(b=>b.y<H);
        // collisions
        buls.forEach(b=>{aliens.forEach(a=>{if(!a.alive)return;if(b.x>a.x&&b.x<a.x+30&&b.y>a.y&&b.y<a.y+22){a.alive=false;b.y=-99;score+=10;}});});
        ebuls.forEach(b=>{if(b.x>px&&b.x<px+30&&b.y>H-30&&b.y<H-10){b.y=9999;lives--;if(lives<=0)alive=false;}});
        if(!aliens.some(a=>a.alive)){spawn();speed=Math.min(4,speed+.3);}
        scoreEl.textContent='score: '+score+' · lives: '+lives;
        if(!alive){clearInterval(iv);hi('invaders',score);hiEl.textContent='best: '+hi('invaders');scoreEl.textContent='game over — click to restart';c.style.cursor='pointer';return;}
        g.fillStyle='#000';g.fillRect(0,0,W,H);
        g.fillStyle='#7df9ff';g.fillRect(px,H-20,30,10);
        aliens.forEach(a=>{if(!a.alive)return;g.fillStyle=['#ff6ec7','#c0ff00','#ffea00','#ff5b5b'][a.kind];g.fillRect(a.x,a.y,26,16);g.fillRect(a.x+6,a.y-4,4,4);g.fillRect(a.x+16,a.y-4,4,4);});
        g.fillStyle='#fff';buls.forEach(b=>g.fillRect(b.x-1,b.y-6,2,8));
        ebuls.forEach(b=>g.fillRect(b.x-1,b.y,2,8));
      }
      c.addEventListener('click',()=>{if(!alive){px=W/2;buls=[];ebuls=[];score=0;lives=3;dir=1;speed=1;alive=true;spawn();c.style.cursor='';iv=setInterval(step,1000/30);}});
      iv=setInterval(step,1000/30);
      body._cleanup=()=>{clearInterval(iv);k.destroy();};
    }});

})();
