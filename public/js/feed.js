// Feed / post / profile / people / communities / admin / settings views.
(function(){
  const { $, $$, el, openModal, closeModal, toast, bindTooltips, avatarEl, escapeHTML, fmtDate, fmtJoined, playMusic } = window.UI;

  const state = {
    me: null,
    communities: [],
    currentView: 'home',
    currentCommunityId: null,
  };

  // ---------- RENDERERS ----------
  function screen(){ return $('#screen'); }
  function setTitle(t, sub){
    const tt = document.getElementById('tvTitle'); if(tt) tt.textContent = t;
    const ts = document.getElementById('tvSub'); if(ts) ts.textContent = sub||'';
    const wn = document.getElementById('winName'); if(wn) wn.textContent = t;
    const ws = document.getElementById('winSub'); if(ws) ws.textContent = sub||'onlysnackpack';
  }

  function postNode(p, opts){
    opts = opts||{};
    const tmpl = p.template || 'default';
    const node = el('div',{class:'post post-'+tmpl+(opts.glow?' glow':'')});
    // head
    const head = el('div',{class:'post-head'});
    head.appendChild(avatarEl(p.author, 34));
    const who = el('div',{});
    who.appendChild(el('div',{class:'p-name'}, p.author ? p.author.displayName : '???'));
    const fd = fmtDate(p.createdAt);
    const sub = el('div',{class:'p-sub'},[
      document.createTextNode('@'+(p.author?p.author.username:'?')+' · '),
      el('span',{title:fd.full}, fd.rel),
    ]);
    if (p.author) sub.appendChild(document.createTextNode(' · '+fmtJoined(p.author.joinedAt)));
    who.appendChild(sub);
    head.appendChild(who);
    if (p.community){
      const c = el('div',{class:'p-comm', style:'color:'+p.community.color}, [
        el('span',{class:'comm-swatch', style:'background:'+p.community.color+';box-shadow:0 0 6px '+p.community.color}),
        document.createTextNode(p.community.name)
      ]);
      head.appendChild(c);
    } else {
      const c = el('div',{class:'p-comm', style:'color:#7d7da7;border-color:#7d7da7'}, 'main feed');
      head.appendChild(c);
    }
    node.appendChild(head);

    // body
    if (p.text) node.appendChild(el('div',{class:'p-body'}, p.text)); // user text: we'll escape before insert

    // media
    const media = el('div',{class:'p-media'});
    if (p.photo) media.appendChild(el('img',{src:p.photo,alt:''}));
    if (p.video) {
      const v = el('video',{src:p.video, controls:'1'});
      media.appendChild(v);
    }
    if (p.photo || p.video) node.appendChild(media);

    // music bar at the bottom
    if (p.music && p.music.url){
      const bar = el('div',{class:'p-music'});
      const bars = el('div',{class:'bars'});
      for (let i=0;i<5;i++) bars.appendChild(el('i'));
      bar.appendChild(bars);
      const playBtn = el('button',{class:'pm-play',onclick:()=>{
        playMusic(p.music.url, p.music.title || 'track', '@'+(p.author?p.author.username:'?'));
      }}, '▶');
      bar.appendChild(playBtn);
      const info = el('div',{class:'pm-info'}, [
        el('div',{class:'pm-title'}, '♪ '+(p.music.title||'untitled')),
        el('div',{class:'pm-sub'}, 'attached track · click to play')
      ]);
      bar.appendChild(info);
      node.appendChild(bar);
    }

    // actions
    const actions = el('div',{class:'p-actions'});
    const liked = state.me && (p.likedBy||[]).includes(state.me.username);
    const likeBtn = el('button',{class:'act'+(liked?' on':''),onclick:async()=>{
      if (!state.me){ toast('log in to like','bad'); return; }
      try{
        const r = await api.likePost(p.id);
        likeBtn.classList.toggle('on', r.liked);
        likeBtn.lastChild.textContent = ' '+r.likes+' likes';
      }catch(e){ toast(e.message,'bad'); }
    }}, [el('span',{}, liked?'♥':'♡'), document.createTextNode(' '+p.likes+' likes')]);
    actions.appendChild(likeBtn);

    const cmtBtn = el('button',{class:'act',onclick:()=>openComments(postWrap)}, [
      el('span',{},'◔'), document.createTextNode(' '+p.commentCount+' comments')
    ]);
    actions.appendChild(cmtBtn);

    const profileBtn = el('button',{class:'act',onclick:()=>route('profile', p.author.username)}, [
      el('span',{},'☺'), document.createTextNode(' @'+(p.author?p.author.username:'?'))
    ]);
    actions.appendChild(profileBtn);

    // copy link
    const linkBtn = el('button',{class:'act',onclick:()=>{
      const url = location.origin+location.pathname+'#/post/'+p.id;
      try{ navigator.clipboard.writeText(url); toast('link copied','good'); }catch(e){
        const i=document.createElement('input');i.value=url;document.body.appendChild(i);i.select();document.execCommand('copy');i.remove();toast('link copied','good');
      }
    }},[el('span',{},'◉'), document.createTextNode(' link')]);
    actions.appendChild(linkBtn);

    if (state.me && p.author && p.author.username === state.me.username){
      const del = el('button',{class:'act',onclick:async()=>{
        if (!confirm('delete this post?')) return;
        try{ await api.deletePost(p.id); toast('deleted','good'); postWrap.remove(); }catch(e){toast(e.message,'bad');}
      }},[el('span',{},'✕'), document.createTextNode(' delete')]);
      actions.appendChild(del);
    }

    node.appendChild(actions);
    const comments = el('div',{class:'p-comments'});
    node.appendChild(comments);

    const postWrap = el('div',{},[node]);
    postWrap._postId = p.id;
    postWrap._comments = comments;
    postWrap._loaded = false;
    postWrap._loadComments = async () => {
      if (postWrap._loaded) return;
      postWrap._loaded = true;
      await renderComments(p.id, comments, postWrap);
    };
    cmtBtn._wrap = postWrap;
    return postWrap;
  }

  async function openComments(wrap){
    if (!wrap._loaded) await wrap._loadComments();
    // scroll to comments
    wrap._comments.scrollIntoView({behavior:'smooth', block:'nearest'});
  }

  async function renderComments(postId, container, wrap){
    container.innerHTML = '<div class="loading" style="padding:8px">loading…</div>';
    try {
      const cs = await api.comments(postId);
      container.innerHTML = '';
      for (const c of cs){
        const b = el('div',{class:'bubble'});
        const fdc = fmtDate(c.createdAt);
        const hd = el('div',{class:'b-head'}, [
          avatarEl(c.author,18),
          el('span',{class:'b-name'}, '@'+c.author.username),
          el('span',{title:fdc.full}, fdc.rel),
        ]);
        if (state.me && c.author.username === state.me.username){
          hd.appendChild(el('button',{class:'b-x',onclick:async()=>{
            try{ await api.deleteComment(c.id); b.remove(); toast('deleted','good'); }catch(e){toast(e.message,'bad');}
          }}, '✕'));
        }
        b.appendChild(hd);
        b.appendChild(el('div',{}, c.text));
        container.appendChild(b);
      }
      if (state.me){
        const form = el('form',{class:'cmt-form', onsubmit:async(ev)=>{
          ev.preventDefault();
          const inp = form.querySelector('input');
          const v = inp.value.trim(); if (!v) return;
          inp.value = '';
          try{
            const nc = await api.addComment(postId, v);
            // update count
            await renderComments(postId, container, wrap);
            // bump count label
            const btn = wrap.querySelector('.p-actions .act:nth-child(2)');
            if (btn){ const m = btn.lastChild.textContent.match(/\d+/); const n = (parseInt(m?m[0]:'0',10))+1; btn.lastChild.textContent = ' '+n+' comments'; }
          }catch(e){ toast(e.message,'bad'); }
        }}, [
          el('input',{type:'text',placeholder:'say something… (speech bubble)'}),
          el('button',{class:'btn primary',type:'submit'}, 'send')
        ]);
        container.appendChild(form);
      } else {
        container.appendChild(el('div',{class:'notice',style:'margin-top:8px'}, 'log in to leave a comment'));
      }
    } catch(e){
      container.textContent = 'failed to load: '+e.message;
    }
  }

  // ---------- VIEWS ----------
  async function viewHome(){
    setTitle('home', 'main feed — anyone can post here, no community required');
    const s = screen(); s.innerHTML = '<div class="loading">tuning in…</div>';
    try {
      const posts = await api.posts({feed:'main', limit:60});
      s.innerHTML = '';
      if (!posts.length){
        s.appendChild(el('div',{class:'notice'}, 'nothing here yet. be the first to post.'));
      }
      posts.forEach(p => {
        // escape text for safety (we inserted as text node anyway via .append, but just being safe)
        const np = Object.assign({}, p, { text: p.text });
        const n = postNode(np);
        n.querySelector('.p-body').textContent = p.text; // use textContent to escape
        s.appendChild(n);
      });
    } catch(e){ s.textContent = 'error: '+e.message; }
  }
  async function viewFollowing(){
    setTitle('following', 'posts from people you follow (+ your own)');
    const s = screen(); s.innerHTML = '<div class="loading">tuning in…</div>';
    if (!state.me){ s.innerHTML = ''; s.appendChild(el('div',{class:'notice'}, 'log in to use the following feed.')); return; }
    try {
      const posts = await api.posts({feed:'following', limit:60});
      s.innerHTML = '';
      posts.forEach(p => {
        const n = postNode(p);
        n.querySelector('.p-body').textContent = p.text;
        s.appendChild(n);
      });
      if (!posts.length) s.appendChild(el('div',{class:'notice'}, 'nothing from people you follow yet. follow some folks!'));
    } catch(e){ s.textContent = 'error: '+e.message; }
  }
  async function viewExplore(){
    setTitle('explore', 'every public post, newest first');
    const s = screen(); s.innerHTML = '<div class="loading">tuning in…</div>';
    try {
      const posts = await api.posts({limit:80});
      s.innerHTML = '';
      posts.forEach(p => {
        const n = postNode(p);
        n.querySelector('.p-body').textContent = p.text;
        s.appendChild(n);
      });
    } catch(e){ s.textContent = 'error: '+e.message; }
  }

  async function viewCommunity(id){
    const c = state.communities.find(x=>x.id===id);
    if (!c) { viewHome(); return; }
    setTitle(c.name, c.description || 'community feed');
    const s = screen(); s.innerHTML = '<div class="loading">tuning in…</div>';
    try {
      const posts = await api.posts({communityId:id, limit:60});
      s.innerHTML = '';
      // header card with custom color/icon
      const fdc = fmtDate(c.createdAt);
      const meta = el('div',{class:'c-meta'},[
        el('span',{}, 'created by @'+c.creator),
        el('span',{}, (c.memberCount||0)+' members'),
        el('span',{title:fdc.full}, fdc.rel),
      ]);
      if (state.me){
        if (c.members && c.members.includes(state.me.username)){
          meta.appendChild(el('button',{class:'btn',onclick:async()=>{try{await api.leaveCommunity(id); await refreshCommunities(); await viewCommunity(id);}catch(e){toast(e.message,'bad');}}},'leave'));
        } else {
          meta.appendChild(el('button',{class:'btn primary',onclick:async()=>{try{await api.joinCommunity(id); await refreshCommunities(); await viewCommunity(id);}catch(e){toast(e.message,'bad');}}},'join'));
        }
        if (c.creator === state.me.username) meta.appendChild(el('button',{class:'btn',onclick:()=>openCommunityEditor(c)}, 'customize'));
      }
      const header = el('div',{class:'comm-card',style:'border-color:'+c.color+';background:'+c.color+'11;cursor:default'}, [
        el('h3',{},[
          el('span',{class:'c-dot',style:'background:'+c.color+';box-shadow:0 0 10px '+c.color}),
          document.createTextNode(' '+c.name+' '),
        ]),
        el('p',{}, c.description || 'no description yet.'),
        meta,
      ]);
      if (c.bgImage){
        const bg = el('div',{class:'c-bg', style:'background-image:url('+c.bgImage+')'});
        header.insertBefore(bg, header.firstChild);
      }
      s.appendChild(header);
      posts.forEach(p => {
        const n = postNode(p); n.querySelector('.p-body').textContent = p.text; s.appendChild(n);
      });
      if (!posts.length) s.appendChild(el('div',{class:'notice'}, 'no posts in this community yet. say hi.'));
    } catch(e){ s.textContent = 'error: '+e.message; }
  }

  async function viewPeople(){
    setTitle('people', 'everybody on ONLYSNACKPACK — sorted by join date (accurate)');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    try {
      const q = '';
      let users = await api.users(q);
      s.innerHTML = '';
      const search = el('input',{placeholder:'search by username…',style:'width:100%;margin-bottom:10px'});
      search.addEventListener('input', async()=>{
        users = await api.users(search.value);
        listWrap.innerHTML = '';
        users.forEach(u => listWrap.appendChild(personNode(u)));
      });
      s.appendChild(search);
      const listWrap = el('div',{class:'people'});
      users.forEach(u => listWrap.appendChild(personNode(u)));
      s.appendChild(listWrap);
    } catch(e){ s.textContent = 'error: '+e.message; }
  }

  function personNode(u){
    const isMe = state.me && state.me.username === u.username;
    const isFollowing = state.me && state.me._follows && state.me._follows[u.username];
    const node = el('div',{class:'person'}, [
      avatarEl(u,40),
      el('div',{},[
        el('div',{class:'p-name'}, u.displayName),
        el('div',{class:'p-sub'}, '@'+u.username+' · '+fmtJoined(u.joinedAt))
      ]),
      isMe ? el('button',{class:'btn',onclick:()=>route('profile',u.username)},'me') : (state.me ? el('button',{class:'btn'+(isFollowing?'':' primary'),onclick:async(ev)=>{
        try{
          if (isFollowing){
            await api.unfollow(u.username); state.me._follows = state.me._follows||{}; delete state.me._follows[u.username];
            ev.target.textContent='follow'; ev.target.classList.add('primary');
          } else {
            await api.follow(u.username); state.me._follows = state.me._follows||{}; state.me._follows[u.username]=true;
            ev.target.textContent='unfollow'; ev.target.classList.remove('primary');
          }
        }catch(e){toast(e.message,'bad');}
      }}, isFollowing?'unfollow':'follow') : null)
    ]);
    node.style.cursor='pointer';
    node.addEventListener('click',(e)=>{
      if (e.target.tagName==='BUTTON') return;
      route('profile', u.username);
    });
    return node;
  }

  async function viewProfile(username){
    setTitle('@'+username, 'profile');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    try{
      const prof = await api.userProfile(username);
      s.innerHTML = '';
      const u = prof.user;
      // ID card
      const card = el('div',{class:'idcard',style:'background:'+('linear-gradient(135deg,'+u.color+','+shade(u.color,-40)+')')+(u.cardBg?',url('+u.cardBg+') center/cover':'')});
      card.appendChild(el('div',{class:'id-hd'}, [
        el('div',{}, 'ONLYSNACKPACK'),
        el('div',{}, 'ID-CARD'),
      ]));
      card.appendChild(el('div',{class:'id-code'}, u.userCode));
      const grid = el('div',{class:'id-grid'});
      const photo = el('div',{class:'id-photo'});
      if (u.avatar){ photo.style.background = 'url('+u.avatar+') center/cover'; }
      else { photo.textContent = (u.displayName||u.username).slice(0,1).toUpperCase(); photo.style.background = 'rgba(0,0,0,.4)'; }
      grid.appendChild(photo);
      const info = el('div',{class:'id-info'});
      info.appendChild(el('div',{class:'f'}, 'NAME'));
      info.appendChild(el('div',{class:'v'}, u.displayName));
      info.appendChild(el('div',{class:'f'}, 'USER'));
      info.appendChild(el('div',{class:'v'}, '@'+u.username));
      info.appendChild(el('div',{class:'f'}, 'JOINED'));
      info.appendChild(el('div',{class:'v'}, new Date(u.joinedAt).toLocaleDateString()));
      grid.appendChild(info);
      card.appendChild(grid);
      card.appendChild(el('div',{class:'id-bar'}));
      s.appendChild(card);

      // bio
      if (u.bio) s.appendChild(el('div',{class:'notice',style:'margin:10px auto;max-width:500px'}, u.bio));

      // stats
      const stats = el('div',{class:'col-2',style:'max-width:500px;margin:0 auto 10px'},[
        el('div',{class:'kv'}, [el('span',{},'followers'), el('span',{},String(prof.followers))]),
        el('div',{class:'kv'}, [el('span',{},'following'), el('span',{},String(prof.following))]),
      ]);
      s.appendChild(stats);

      const actions = el('div',{style:'text-align:center;margin-bottom:10px'});
      if (state.me){
        if (state.me.username !== u.username){
          actions.appendChild(el('button',{class:'btn'+(prof.isFollowing?'':' primary'),onclick:async(ev)=>{
            try{
              if (prof.isFollowing){ await api.unfollow(u.username); ev.target.textContent='follow'; ev.target.classList.add('primary'); prof.isFollowing=false; }
              else { await api.follow(u.username); ev.target.textContent='unfollow'; ev.target.classList.remove('primary'); prof.isFollowing=true; }
            }catch(e){toast(e.message,'bad');}
          }}, prof.isFollowing?'unfollow':'follow'));
        } else {
          actions.appendChild(el('button',{class:'btn',onclick:openProfileEditor}, 'edit profile'));
        }
      }
      s.appendChild(actions);

      s.appendChild(el('h3',{style:'font-family:var(--mono);letter-spacing:2px;color:var(--accent);font-size:13px;margin:10px 0'}, 'posts by @'+u.username));
      prof.posts.forEach(p => {
        const n = postNode(p); n.querySelector('.p-body').textContent = p.text; s.appendChild(n);
      });
      if (!prof.posts.length) s.appendChild(el('div',{class:'notice'}, 'no posts yet.'));
    }catch(e){ s.textContent = 'error: '+e.message; }
  }
  function shade(hex, percent){
    let c = (hex||'#7df9ff').replace('#','');
    if (c.length===3) c = c.split('').map(x=>x+x).join('');
    const num = parseInt(c,16);
    let r=(num>>16)+percent, g=((num>>8)&0xff)+percent, b=(num&0xff)+percent;
    r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
    return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
  }

  async function viewMusicLibrary(){
    setTitle('music library', 'upload your own tracks — anyone can upload music');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    try{
      const tracks = await api.music();
      s.innerHTML = '';
      if (state.me){
        const up = el('div',{class:'notice',style:'margin-bottom:10px'});
        up.appendChild(document.createTextNode('upload a track (mp3/wav/ogg, up to 60MB): '));
        const fi = el('input',{type:'file',accept:'audio/*'});
        const ti = el('input',{type:'text',placeholder:'title (optional)',style:'margin:0 6px'});
        const btn = el('button',{class:'btn primary',onclick:async()=>{
          if (!fi.files[0]){ toast('pick a file first','bad'); return; }
          btn.disabled=true; btn.textContent='uploading…';
          try{ const r = await api.uploadMusic(fi.files[0], ti.value); toast('uploaded '+r.track.title,'good'); viewMusicLibrary(); }
          catch(e){ toast(e.message,'bad'); btn.disabled=false; btn.textContent='upload'; }
        }},'upload');
        up.appendChild(fi); up.appendChild(ti); up.appendChild(btn);
        s.appendChild(up);
      }
      if (!tracks.length){ s.appendChild(el('div',{class:'notice'}, 'no tracks yet. be the first to upload.')); return; }
      tracks.forEach(t=>{
        const fdt = fmtDate(t.createdAt);
        const row = el('div',{class:'track'},[
          el('button',{class:'pm-play',onclick:()=>playMusic(t.url, t.title, '@'+t.author+' · '+fdt.rel)},'▶'),
          el('div',{style:'flex:1;min-width:0'},[
            el('div',{class:'pm-title'}, '♪ '+t.title),
            el('div',{class:'pm-sub',title:fdt.full}, '@'+t.author+' · '+fdt.rel),
          ]),
        ]);
        s.appendChild(row);
      });
    } catch(e){ s.textContent='error: '+e.message; }
  }

  async function viewGuestbook(){
    setTitle('guestbook', 'sign the wall — no account needed');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    try{
      const data = await fetch('/api/guestbook').then(r=>r.json());
      s.innerHTML = '';
      const form = el('div',{class:'guestbook-form'},[
        el('h3',{},'★ sign the guestbook ★'),
      ]);
      const name = state.me ? null : el('input',{type:'text',placeholder:'name (optional)',style:'width:100%;margin-bottom:6px'});
      const txt = el('textarea',{placeholder:'leave a note for reality'});
      const err = el('div',{class:'wrong'});
      const btn = el('button',{class:'btn primary',style:'margin-top:6px',onclick:async()=>{
        if(!txt.value.trim()){err.textContent='write something';return;}
        try{
          await fetch('/api/guestbook',{method:'POST',headers:{'Content-Type':'application/json','x-token':api.token||''},body:JSON.stringify({name:name?name.value:'',text:txt.value})});
          txt.value='';viewGuestbook();toast('signed ♥','good');
        }catch(e){err.textContent=e.message;}
      }},'sign!');
      if(name)form.appendChild(name);
      form.appendChild(txt);form.appendChild(err);form.appendChild(btn);
      s.appendChild(form);
      if(!data.entries.length){s.appendChild(el('div',{class:'notice'},'no signatures yet. be the first.'));}
      data.entries.forEach(e=>{
        const fdg = fmtDate(e.createdAt);
        const b=el('div',{class:'bubble',style:'margin:6px 0 6px 20px;max-width:90%'});
        b.appendChild(el('div',{class:'b-head'},[el('span',{class:'b-name'},e.name),el('span',{title:fdg.full},fdg.rel)]));
        b.appendChild(el('div',{},e.text));
        s.appendChild(b);
      });
    }catch(e){s.textContent='error: '+e.message;}
  }

  // ---------- MODAL FORMS ----------
  function openNewPost(){
    if (!state.me){ openAuth(); return; }
    const body = el('div',{});
    const ta = el('textarea',{placeholder:'what\'s real today? no emojis required, words work fine.'});
    body.appendChild(ta);

    let photoUrl = '', videoUrl = '', musicUrl = '', musicTitle = '';

    // photo
    const photoRow = el('div',{class:'row'}, [
      el('label',{},'photo (optional)'),
    ]);
    const photoFi = el('input',{type:'file',accept:'image/*'});
    const photoPrev = el('div',{style:'margin-top:4px'});
    photoFi.addEventListener('change', async()=>{
      if (!photoFi.files[0]) return;
      photoPrev.textContent='uploading…';
      try{ const r = await api.uploadPhoto(photoFi.files[0]); photoUrl=r.url; photoPrev.innerHTML=''; photoPrev.appendChild(el('img',{src:photoUrl,style:'max-height:90px;border-radius:3px'})); }
      catch(e){ photoPrev.textContent='failed: '+e.message; }
    });
    photoRow.appendChild(photoFi);
    body.appendChild(photoRow);
    body.appendChild(photoPrev);

    // video
    const videoRow = el('div',{class:'row'}, [el('label',{},'video (optional, temple tv)')]);
    const videoFi = el('input',{type:'file',accept:'video/*'});
    const videoPrev = el('div',{class:'p-sub',style:'margin-top:4px'});
    videoFi.addEventListener('change', async()=>{
      if (!videoFi.files[0]) return;
      videoPrev.textContent='uploading…';
      try{ const r = await api.uploadVideo(videoFi.files[0]); videoUrl=r.url; videoPrev.textContent='ready: '+videoFi.files[0].name; }
      catch(e){ videoPrev.textContent='failed: '+e.message; }
    });
    videoRow.appendChild(videoFi);
    body.appendChild(videoRow);
    body.appendChild(videoPrev);

    // music
    const musicRow = el('div',{class:'row'},[el('label',{},'music / sound (optional, plays at bottom of post)')]);
    const mtitle = el('input',{type:'text',placeholder:'track title'});
    const mfi = el('input',{type:'file',accept:'audio/*'});
    const mstat = el('div',{class:'p-sub',style:'margin-top:4px'});
    mfi.addEventListener('change', async()=>{
      if (!mfi.files[0]) return;
      mstat.textContent='uploading…';
      try{ const r = await api.uploadMusic(mfi.files[0], mtitle.value); musicUrl=r.url; musicTitle=r.track.title; mstat.textContent='track ready: '+r.track.title; }
      catch(e){ mstat.textContent='failed: '+e.message; }
    });
    musicRow.appendChild(mfi);
    body.appendChild(mtitle);
    body.appendChild(musicRow);
    body.appendChild(mstat);

    // community picker
    const cRow = el('div',{class:'row'},[el('label',{},'post to')]);
    const sel = el('select',{});
    sel.appendChild(el('option',{value:''}, 'main feed (anyone, no community needed)'));
    state.communities.forEach(c=>{
      const o = el('option',{value:c.id}, c.name);
      sel.appendChild(o);
    });
    cRow.appendChild(sel);
    body.appendChild(cRow);

    // post style
    const tRow = el('div',{class:'row',style:'align-items:center'})
    tRow.appendChild(el('label',{style:'margin:0'},'style'));
    const tSel = el('select',{});
    [['default','polaroid'],['neon','neon'],['sticky','sticky note'],['crt','crt terminal'],['zine','zine']].forEach(([v,l])=>{
      tSel.appendChild(el('option',{value:v}, l));
    });
    tRow.appendChild(tSel);
    body.appendChild(tRow);

    const err = el('div',{class:'wrong'});
    body.appendChild(err);
    const submit = el('button',{class:'btn primary',onclick:async()=>{
      const text = ta.value.trim();
      if (!text && !photoUrl && !videoUrl && !musicUrl){ err.textContent='write something or attach media.'; return; }
      submit.disabled=true; submit.textContent='posting…';
      try{
        await api.createPost({
          text,
          photo: photoUrl,
          video: videoUrl,
          music: musicUrl ? { url: musicUrl, title: musicTitle } : null,
          communityId: sel.value || null,
          template: tSel.value,
        });
        closeModal();
        toast('posted','good');
        // refresh current view
        route(state.currentView, state.currentCommunityId);
      }catch(e){ err.textContent=e.message; submit.disabled=false; submit.textContent='post'; }
    }},'post to reality');
    body.appendChild(el('div',{style:'margin-top:10px;text-align:right'}, submit));

    openModal('new post', body);
    setTimeout(()=>ta.focus(),50);
  }

  function openNewCommunity(){
    if (!state.me){ openAuth(); return; }
    const body = el('div',{});
    const name = el('input',{type:'text',placeholder:'community name (e.g. pixel art)'});
    const desc = el('textarea',{placeholder:'what\'s it about?'});
    const colors = ['#7df9ff','#ff6ec7','#c0ff00','#ffb347','#b388ff','#ff5b5b','#4aff8c','#ffea00','#ffffff'];
    let picked = colors[0];
    const sw = el('div',{class:'swatchrow'});
    colors.forEach(c=>{
      const s = el('div',{class:'swatch'+(c===picked?' on':''),style:'background:'+c,onclick:()=>{picked=c; $$('.swatch',sw).forEach(x=>x.classList.remove('on')); s.classList.add('on');}});
      sw.appendChild(s);
    });
    let icon = el('input',{type:'text',placeholder:'icon (one character, e.g. ◉, ☼, ♪, ✦)','maxlength':'2',value:'◉'});
    const err = el('div',{class:'wrong'});
    const submit = el('button',{class:'btn primary',onclick:async()=>{
      if (!name.value.trim()){ err.textContent='need a name'; return; }
      submit.disabled=true;
      try{
        await api.createCommunity({ name:name.value.trim(), description:desc.value.trim(), color:picked, icon:icon.value||'◉' });
        closeModal(); toast('community created','good');
        await refreshCommunities();
        route('community', state.communities[state.communities.length-1].id);
      }catch(e){ err.textContent=e.message; submit.disabled=false; }
    }},'create');
    body.appendChild(el('label',{},'name')); body.appendChild(name);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'description')); body.appendChild(desc);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'color')); body.appendChild(sw);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'icon')); body.appendChild(icon);
    body.appendChild(err);
    body.appendChild(el('div',{style:'margin-top:10px;text-align:right'}, submit));
    openModal('new community', body);
  }

  function openCommunityEditor(c){
    if (!state.me || c.creator !== state.me.username) return;
    const body = el('div',{});
    const name = el('input',{type:'text',value:c.name});
    const desc = el('textarea',{}); desc.value = c.description||'';
    const colors = ['#7df9ff','#ff6ec7','#c0ff00','#ffb347','#b388ff','#ff5b5b','#4aff8c','#ffea00','#ffffff'];
    let picked = c.color;
    const sw = el('div',{class:'swatchrow'});
    colors.forEach(col=>{
      const s = el('div',{class:'swatch'+(col===picked?' on':''),style:'background:'+col,onclick:()=>{picked=col; $$('.swatch',sw).forEach(x=>x.classList.remove('on'));s.classList.add('on');}});
      sw.appendChild(s);
    });
    const icon = el('input',{type:'text',value:c.icon||'◉','maxlength':'2'});
    const bgFi = el('input',{type:'file',accept:'image/*'});
    const bgStat = el('div',{class:'p-sub'}, c.bgImage?'has background image':'no background image');
    let bgUrl = c.bgImage || '';
    bgFi.addEventListener('change', async()=>{
      if (!bgFi.files[0]) return;
      bgStat.textContent='uploading…';
      try{ const r = await api.uploadPhoto(bgFi.files[0]); bgUrl=r.url; bgStat.textContent='background ready'; }
      catch(e){ bgStat.textContent='fail: '+e.message; }
    });
    const err = el('div',{class:'wrong'});
    const submit = el('button',{class:'btn primary',onclick:async()=>{
      try{
        await api.editCommunity(c.id,{name:name.value.trim(),description:desc.value.trim(),color:picked,icon:icon.value||'◉',bgImage:bgUrl});
        closeModal(); toast('saved','good');
        await refreshCommunities();
        route('community', c.id);
      }catch(e){ err.textContent=e.message; }
    }},'save');
    body.appendChild(el('label',{},'name')); body.appendChild(name);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'description')); body.appendChild(desc);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'color')); body.appendChild(sw);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'icon')); body.appendChild(icon);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'background picture (optional)')); body.appendChild(bgFi); body.appendChild(bgStat);
    body.appendChild(err);
    body.appendChild(el('div',{style:'margin-top:10px;text-align:right'}, submit));
    openModal('customize community', body);
  }

  function openProfileEditor(){
    if (!state.me) return;
    const body = el('div',{});
    const dn = el('input',{type:'text',value:state.me.displayName||state.me.username});
    const bio = el('textarea',{}); bio.value = state.me.bio||'';
    const colors = ['#7df9ff','#ff6ec7','#c0ff00','#ffb347','#b388ff','#ff5b5b','#4aff8c','#ffea00','#ffffff','#ff8ad8'];
    let picked = state.me.color;
    const sw = el('div',{class:'swatchrow'});
    colors.forEach(c=>{
      const s = el('div',{class:'swatch'+(c===picked?' on':''),style:'background:'+c,onclick:()=>{picked=c; $$('.swatch',sw).forEach(x=>x.classList.remove('on'));s.classList.add('on');}});
      sw.appendChild(s);
    });
    const avFi = el('input',{type:'file',accept:'image/*'});
    const avStat = el('div',{class:'p-sub'}, state.me.avatar?'has avatar':'no avatar');
    let avUrl = state.me.avatar || '';
    avFi.addEventListener('change', async()=>{
      if (!avFi.files[0]) return;
      avStat.textContent='uploading…';
      try{ const r = await api.uploadPhoto(avFi.files[0]); avUrl=r.url; avStat.textContent='avatar ready'; }
      catch(e){ avStat.textContent='fail: '+e.message; }
    });
    const bgFi = el('input',{type:'file',accept:'image/*'});
    const bgStat = el('div',{class:'p-sub'}, state.me.cardBg?'has card bg':'no card background');
    let bgUrl = state.me.cardBg || '';
    bgFi.addEventListener('change', async()=>{
      if (!bgFi.files[0]) return;
      bgStat.textContent='uploading…';
      try{ const r = await api.uploadPhoto(bgFi.files[0]); bgUrl=r.url; bgStat.textContent='card bg ready'; }
      catch(e){ bgStat.textContent='fail: '+e.message; }
    });
    const err = el('div',{class:'wrong'});
    const submit = el('button',{class:'btn primary',onclick:async()=>{
      try{
        const u = await api.saveMe({displayName:dn.value.trim(),bio:bio.value.trim(),color:picked,avatar:avUrl,cardBg:bgUrl});
        state.me = Object.assign(state.me||{}, u);
        window.OSP.meUpdated(state.me);
        closeModal(); toast('saved','good');
        route(state.currentView, state.currentCommunityId);
      }catch(e){ err.textContent=e.message; }
    }},'save');
    body.appendChild(el('label',{},'display name')); body.appendChild(dn);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'bio')); body.appendChild(bio);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'accent color')); body.appendChild(sw);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'avatar photo')); body.appendChild(avFi); body.appendChild(avStat);
    body.appendChild(el('label',{style:'margin-top:8px;display:block'},'id card background')); body.appendChild(bgFi); body.appendChild(bgStat);
    body.appendChild(err);
    body.appendChild(el('div',{style:'margin-top:10px;text-align:right'}, submit));
    openModal('edit profile', body);
  }

  function openAuth(initialTab){
    initialTab = initialTab || 'login';
    const body = el('div',{});
    const wrap = el('div',{class:'auth-wrap'},[
      el('div',{class:'auth-logo'}, 'ONLYSNACKPACK'),
      el('div',{class:'auth-sub'}, 'reality (2008)'),
    ]);
    const tabs = el('div',{class:'auth-tabs'});
    const tLogin = el('button',{class: initialTab==='login'?'on':''}, 'LOG IN');
    const tSign = el('button',{class: initialTab==='signup'?'on':''}, 'SIGN UP');
    tabs.appendChild(tLogin); tabs.appendChild(tSign);
    wrap.appendChild(tabs);

    const box = el('div',{});
    wrap.appendChild(box);
    wrap.appendChild(el('div',{class:'boot-fine',style:'text-align:center;margin-top:10px'}, 'new users start with nothing. earn it.'));
    body.appendChild(wrap);

    function showLogin(){
      tLogin.classList.add('on'); tSign.classList.remove('on');
      box.innerHTML = '';
      const u = el('input',{type:'text',placeholder:'username'});
      const p = el('input',{type:'password',placeholder:'password'});
      const err = el('div',{class:'wrong'});
      const btn = el('button',{class:'btn primary',style:'width:100%;margin-top:8px',onclick:async()=>{
        err.textContent=''; btn.disabled=true;
        try{ const me = await api.login(u.value.trim(), p.value); onAuth(me); }
        catch(e){ err.textContent=e.message; btn.disabled=false; }
      }},'log in');
      box.appendChild(el('label',{},'username')); box.appendChild(u);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'password')); box.appendChild(p);
      box.appendChild(err); box.appendChild(btn);
      setTimeout(()=>u.focus(),30);
    }
    function showSignup(){
      tSign.classList.add('on'); tLogin.classList.remove('on');
      box.innerHTML = '';
      const u = el('input',{type:'text',placeholder:'username'});
      const dn = el('input',{type:'text',placeholder:'display name (optional)'});
      const p = el('input',{type:'password',placeholder:'password'});
      const err = el('div',{class:'wrong'});
      const btn = el('button',{class:'btn primary',style:'width:100%;margin-top:8px',onclick:async()=>{
        err.textContent=''; btn.disabled=true;
        try{ const me = await api.signup(u.value.trim(), p.value, dn.value.trim()||u.value.trim()); onAuth(me); }
        catch(e){ err.textContent=e.message; btn.disabled=false; }
      }},'create account');
      box.appendChild(el('label',{},'username')); box.appendChild(u);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'display name')); box.appendChild(dn);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'password')); box.appendChild(p);
      box.appendChild(el('div',{class:'boot-fine',style:'text-align:center;margin-top:6px'},'pick something you will remember.'));
      box.appendChild(err); box.appendChild(btn);
      setTimeout(()=>u.focus(),30);
    }
    tLogin.addEventListener('click',showLogin); tSign.addEventListener('click',showSignup);
    if (initialTab==='signup') showSignup(); else showLogin();

    openModal('welcome', body, { onClose: ()=>{} });
  }
  function onAuth(me){
    state.me = me;
    window.OSP.meUpdated(me);
    closeModal();
    toast('welcome, '+me.displayName,'good');
    // refresh communities to mark joined
    refreshCommunities().then(()=>route(state.currentView||'home'));
  }

  // ---------- ADMIN (ONLYSNACKPACK) ----------
  async function viewAdmin(){
    setTitle('ONLYSNACKPACK', 'admin-only zone — password: packers');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    // public preview always visible
    let pw = sessionStorage.getItem('osp_admin_pw') || '';
    function gate(message){
      s.innerHTML = '';
      const box = el('div',{class:'admin-gate'},[
        el('div',{class:'admin-banner'},'⚠ ONLYSNACKPACK — ADMIN ZONE ⚠'),
        el('p',{}, message||'enter admin password to post. anyone can view the feed below.'),
      ]);
      const inp = el('input',{type:'password',placeholder:'admin password'});
      const btn = el('button',{class:'btn warn',onclick:async()=>{
        try{ await api.adminCheck(inp.value); pw=inp.value; sessionStorage.setItem('osp_admin_pw',pw); toast('unlocked','good'); render(); }
        catch(e){ err.textContent=e.message; }
      }},'unlock');
      const err = el('div',{class:'wrong'});
      box.appendChild(inp); box.appendChild(btn); box.appendChild(err);
      s.appendChild(box);
      renderFeed();
    }
    async function renderFeed(){
      const pub = await api.adminPublic();
      const wrap = el('div',{style:'margin-top:16px'});
      wrap.appendChild(el('h3',{style:'font-family:var(--mono);letter-spacing:2px;color:var(--warn);font-size:13px'}, 'broadcasts'));
      if (!pub.posts.length){ wrap.appendChild(el('div',{class:'notice'},'no broadcasts yet.')); }
      const grid = el('div',{class:'admin-grid'});
      pub.posts.forEach(p=>{
        const tile = el('div',{class:'admin-tile'});
        if (p.kind==='photo') tile.appendChild(el('img',{src:p.url}));
        if (p.kind==='video') tile.appendChild(el('video',{src:p.url,controls:'1'}));
        if (p.kind==='text'){
          const tb = el('div',{class:'admin-text',style:'padding:10px;background:#000;color:#ffe14d;font-family:var(--mono);font-size:14px;min-height:120px;border:2px dashed #ffe14d'}, p.caption||p.title||'');
          tile.appendChild(tb);
        }
        if (p.title) tile.appendChild(el('div',{class:'pm-title',style:'padding:6px 4px 0'}, p.title));
        if (p.caption && p.kind!=='text') tile.appendChild(el('div',{class:'cap'}, p.caption));
        if (pw){
          tile.appendChild(el('button',{class:'btn danger',style:'margin:6px 2px;font-size:10px',onclick:async()=>{
            try{ await api.adminDelete(pw,p.id); toast('deleted','good'); render(); }catch(e){toast(e.message,'bad');}
          }},'delete'));
        }
        grid.appendChild(tile);
      });
      wrap.appendChild(grid);
      s.appendChild(wrap);
    }
    async function render(){
      s.innerHTML = '';
      if (!pw){ gate(); return; }
      // admin controls
      const box = el('div',{class:'admin-gate',style:'border-style:solid'}, [
        el('div',{class:'admin-banner'},'⚠ ONLYSNACKPACK — POSTING ENABLED ⚠'),
      ]);
      const kind = el('select',{});
      kind.appendChild(el('option',{value:'photo'},'photo'));
      kind.appendChild(el('option',{value:'video'},'video'));
      kind.appendChild(el('option',{value:'text'},'text'));
      const title = el('input',{type:'text',placeholder:'title'});
      const cap = el('textarea',{placeholder:'caption'});
      const fi = el('input',{type:'file',accept:'image/*,video/*'});
      const stat = el('div',{class:'p-sub'});
      let url='';
      fi.addEventListener('change',async()=>{
        if (!fi.files[0]) return;
        stat.textContent='uploading…';
        try{
          const r = await api.adminUpload(pw, fi.files[0]);
          url=r.url; stat.textContent='uploaded';
        }catch(e){ stat.textContent=e.message; }
      });
      const err = el('div',{class:'wrong'});
      const post = el('button',{class:'btn warn',onclick:async()=>{
        try{
          await api.adminPost(pw,{kind:kind.value,url,title:title.value,caption:cap.value});
          toast('broadcast','good'); render();
        }catch(e){ err.textContent=e.message; }
      }},'broadcast');
      const logout = el('button',{class:'btn',onclick:()=>{pw='';sessionStorage.removeItem('osp_admin_pw');render();}},'lock');
      box.appendChild(el('label',{},'type')); box.appendChild(kind);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'title')); box.appendChild(title);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'caption')); box.appendChild(cap);
      box.appendChild(el('label',{style:'margin-top:6px;display:block'},'file (photo/video)')); box.appendChild(fi);
      box.appendChild(stat); box.appendChild(err);
      const row = el('div',{style:'display:flex;gap:6px;margin-top:8px'}); row.appendChild(post); row.appendChild(logout);
      box.appendChild(row);
      s.appendChild(box);
      renderFeed();
    }
    // try stored password first
    if (pw){
      try{ await api.adminCheck(pw); render(); return; }catch(e){ pw=''; sessionStorage.removeItem('osp_admin_pw'); gate('password expired or wrong'); }
    } else gate();
  }

  // ---------- SETTINGS ----------
  async function viewSettings(){
    setTitle('settings', 'make it yours');
    const s = screen(); s.innerHTML = '<div class="loading">loading…</div>';
    const cfg = window.UI.loadSettings();
    s.innerHTML = '';
    const grid = el('div',{class:'settings-grid'});

    // appearance
    const app = el('div',{class:'setting'},[el('h4',{},'appearance')]);
    const colors = ['#7df9ff','#ff6ec7','#c0ff00','#ffb347','#b388ff','#ff5b5b','#4aff8c','#ffea00','#ffffff'];
    let picked = cfg.accent;
    const sw = el('div',{class:'swatchrow'});
    colors.forEach(c=>{
      const s2 = el('div',{class:'swatch'+(c===picked?' on':''),style:'background:'+c,onclick:()=>{picked=c;$$('.swatch',sw).forEach(x=>x.classList.remove('on'));s2.classList.add('on');cfg.accent=c;window.UI.saveSettings(cfg);}});
      sw.appendChild(s2);
    });
    app.appendChild(el('label',{},'accent color')); app.appendChild(sw);

    // custom color picker
    const custRow = el('div',{style:'display:flex;gap:6px;align-items:center;margin-top:6px'});
    const cust = el('input',{type:'color',value:cfg.accent,style:'width:44px;height:28px;padding:0;border:2px solid #2b0f5f;background:#fff'});
    const custBtn = el('button',{class:'btn',onclick:()=>{cfg.accent=cust.value;picked=cust.value;$$('.swatch',sw).forEach(x=>x.classList.remove('on'));window.UI.saveSettings(cfg);toast('custom color saved','good');}},'use custom');
    custRow.appendChild(cust);custRow.appendChild(custBtn);
    app.appendChild(el('label',{style:'margin-top:8px;display:block'},'custom color'));
    app.appendChild(custRow);

    // font picker
    const fontRow = el('select',{style:'width:100%;margin-top:4px'});
    [['default','default (trebuchet)'],['mono','VT323 CRT'],['pixel','pixel'],['comic','comic sans']].forEach(([v,l])=>{
      const o=el('option',{value:v},l); if((cfg.font||'default')===v)o.selected=true; fontRow.appendChild(o);
    });
    fontRow.addEventListener('change',()=>{cfg.font=fontRow.value; window.UI.saveSettings(cfg); document.body.style.fontFamily=({
      default:"var(--sans)", mono:"var(--mono)", pixel:"var(--pixel)", comic:"var(--comic)"
    })[cfg.font];});
    app.appendChild(el('label',{style:'margin-top:8px;display:block'},'font'));
    app.appendChild(fontRow);

    // font size
    const sizeRow = el('div',{style:'display:flex;align-items:center;gap:6px;margin-top:4px'});
    const sizeIn = el('input',{type:'range',min:'10',max:'18',step:'1',value:String(cfg.fontSize||12)});
    const sizeLbl = el('span',{class:'p-sub'},(cfg.fontSize||12)+'px');
    sizeIn.addEventListener('input',()=>{cfg.fontSize=parseInt(sizeIn.value,10);sizeLbl.textContent=cfg.fontSize+'px';document.documentElement.style.fontSize=cfg.fontSize+'px';window.UI.saveSettings(cfg);});
    sizeRow.appendChild(sizeIn);sizeRow.appendChild(sizeLbl);
    app.appendChild(el('label',{style:'margin-top:8px;display:block'},'font size'));
    app.appendChild(sizeRow);

    // glitter toggle
    const glitterOn = cfg.glitter !== false;
    const glTog = el('label',{class:'toggle'+(glitterOn?' on':''),onclick:()=>{
      glTog.classList.toggle('on'); const on2=glTog.classList.contains('on');
      cfg.glitter=on2; document.getElementById('glitter').style.display=on2?'':'none';
      window.UI.saveSettings(cfg);
    }},[el('span',{class:'tg'}),el('span',{},'glitter cursor trail')]);
    app.appendChild(el('div',{style:'height:8px'})); app.appendChild(glTog);

    // scanlines toggle
    const scanOn = cfg.scanlines !== false;
    const scTog = el('label',{class:'toggle'+(scanOn?' on':''),onclick:()=>{
      scTog.classList.toggle('on'); const on2=scTog.classList.contains('on');
      cfg.scanlines=on2; document.body.classList.toggle('no-scanlines',!on2);
      window.UI.saveSettings(cfg);
    }},[el('span',{class:'tg'}),el('span',{},'crt scanlines')]);
    app.appendChild(el('div',{style:'height:8px'})); app.appendChild(scTog);

    // spotlight dark mode
    const on = window.UI.spotMode();
    const tog = el('label',{class:'toggle'+(on?' on':''),onclick:()=>{tog.classList.toggle('on'); window.UI.applySpotlight(tog.classList.contains('on'));}},[
      el('span',{class:'tg'}),
      el('span',{},'spotlight dark mode (light follows your cursor)'),
    ]);
    app.appendChild(el('div',{style:'height:8px'})); app.appendChild(tog);
    grid.appendChild(app);

    // account
    const acc = el('div',{class:'setting'},[el('h4',{},'account')]);
    if (state.me){
      acc.appendChild(el('div',{class:'kv'},[el('span',{},'username'),el('span',{},'@'+state.me.username)]));
      acc.appendChild(el('div',{class:'kv'},[el('span',{},'user code'),el('span',{},state.me.userCode)]));
      acc.appendChild(el('div',{class:'kv'},[el('span',{},'joined'),el('span',{}, new Date(state.me.joinedAt).toLocaleDateString())]));
      const chpw = el('button',{class:'btn',style:'margin-top:8px',onclick:()=>{
        const body=el('div',{});
        const np = el('input',{type:'password',placeholder:'new password'});
        const err=el('div',{class:'wrong'});
        const btn=el('button',{class:'btn primary',onclick:async()=>{
          try{ await api.saveMe({password:np.value}); closeModal(); toast('changed','good'); }catch(e){err.textContent=e.message;}
        }},'change password');
        body.appendChild(el('label',{},'new password'));body.appendChild(np);body.appendChild(err);body.appendChild(btn);
        openModal('change password',body);
      }},'change password');
      acc.appendChild(chpw);
      const logout = el('button',{class:'btn danger',style:'margin-left:6px;margin-top:8px',onclick:async()=>{
        await api.logout();
        window.OSP.loggedOut();
        toast('logged out','good');
        route('home');
      }},'log out');
      acc.appendChild(logout);
    } else {
      acc.appendChild(el('div',{class:'notice'},'you are not logged in.'));
      acc.appendChild(el('button',{class:'btn primary',style:'margin-top:8px',onclick:openAuth},'log in / sign up'));
    }
    grid.appendChild(acc);

    // data
    const data = el('div',{class:'setting'},[el('h4',{},'session')]);
    data.appendChild(el('div',{class:'notice'}, 'the site remembers your log in on this device until you log out. nothing creepy.'));
    const reset = el('button',{class:'btn danger',style:'margin-top:8px',onclick:()=>{
      if (!confirm('wipe local preferences (colors, dark mode, etc)? server data stays.')) return;
      localStorage.clear(); sessionStorage.clear(); location.reload();
    }},'reset local data');
    data.appendChild(reset);
    grid.appendChild(data);

    // stats
    const stats = el('div',{class:'setting'},[el('h4',{},'server stats')]);
    try{
      const st = await api.stats();
      stats.appendChild(el('div',{class:'kv'},[el('span',{},'users'),el('span',{},String(st.users))]));
      stats.appendChild(el('div',{class:'kv'},[el('span',{},'posts'),el('span',{},String(st.posts))]));
      stats.appendChild(el('div',{class:'kv'},[el('span',{},'comments'),el('span',{},String(st.comments))]));
      stats.appendChild(el('div',{class:'kv'},[el('span',{},'communities'),el('span',{},String(st.communities))]));
      stats.appendChild(el('div',{class:'kv'},[el('span',{},'server time'),el('span',{},new Date(st.serverTime).toLocaleString())]));
    }catch(e){ stats.appendChild(el('div',{class:'p-sub'},'unavailable')); }
    grid.appendChild(stats);

    // custom css
    const cssBox = el('div',{class:'setting'},[el('h4',{},'custom css')]);
    const cssTa = el('textarea',{placeholder:'/* write any custom css here, saves to your browser */',style:'width:100%;min-height:100px;font-family:var(--mono);font-size:11px;'});
    cssTa.value = cfg.customCss||'';
    const cssRow = el('div',{style:'display:flex;gap:6px;margin-top:6px'});
    cssRow.appendChild(el('button',{class:'btn primary',onclick:()=>{cfg.customCss=cssTa.value;window.UI.saveSettings(cfg);toast('css applied','good');}},'apply'));
    cssRow.appendChild(el('button',{class:'btn',onclick:()=>{cssTa.value='';cfg.customCss='';window.UI.saveSettings(cfg);toast('css cleared','good');}},'clear'));
    cssBox.appendChild(cssTa);cssBox.appendChild(cssRow);
    grid.appendChild(cssBox);

    s.appendChild(grid);

    s.appendChild(el('div',{class:'notice',style:'margin-top:14px'}, 'tip: on the sidebar, hover any button for a tooltip so you know what you are clicking. every account is created by a real visitor. join dates are accurate.'));
  }

  // ---------- ROUTER ----------
  function route(view, param){
    state.currentView = view;
    state.currentCommunityId = view === 'community' ? param : null;
    if (view !== 'app' && window.APPS && window.APPS.clearActiveApp) window.APPS.clearActiveApp();
    // sidebar active
    $$('.side-item').forEach(n=>n.classList.remove('active'));
    const match = $$('.side-item').find(n=>n.getAttribute('data-view')===view);
    if (match) match.classList.add('active');
    $$('.comm-item').forEach(n=>n.classList.toggle('active', view==='community' && n.dataset.cid===param));

    const ch = {home:'CH-01',following:'CH-02',explore:'CH-03',community:'CH-04',profile:'CH-05',people:'CH-06',admin:'CH-00',settings:'CH-99',musiclibrary:'CH-07',app:'CH-AP'}[view] || 'CH-??';
    $('#tvCh').textContent = ch;

    (async()=>{
      switch(view){
        case 'home': return viewHome();
        case 'following': return viewFollowing();
        case 'explore': return viewExplore();
        case 'community': return viewCommunity(param);
        case 'profile': return viewProfile(param);
        case 'people': return viewPeople();
        case 'admin': return viewAdmin();
        case 'settings': return viewSettings();
        case 'musiclibrary': return viewMusicLibrary();
        case 'guestbook': return viewGuestbook();
        case 'app': return window.APPS.runApp(param, screen(), setTitle);
      }
    })().catch(e=>{ screen().textContent = 'error: '+e.message; });
  }

  // ---------- SIDEBAR POPULATION ----------
  async function refreshCommunities(){
    try {
      state.communities = await api.communities();
      const list = $('#communityList');
      list.innerHTML='';
      if (!state.communities.length){
        list.appendChild(el('div',{class:'p-sub',style:'padding:8px'},'no communities yet. make one.'));
      }
      state.communities.forEach(c=>{
        const joined = state.me && (c.members||[]).includes(state.me.username);
        const btn = el('button',{class:'side-item comm-item','data-cid':c.id,'data-tooltip':(c.description||c.name)+(joined?' · joined':'')},[
          el('span',{class:'comm-swatch',style:'background:'+c.color+';color:'+c.color+';box-shadow:0 0 5px '+c.color}, c.icon||'◉'),
          el('span',{class:'si-label'}, c.name),
          joined ? el('span',{style:'margin-left:auto;color:var(--accent3);font-size:10px'},'●') : null,
        ]);
        btn.addEventListener('click',()=>route('community', c.id));
        list.appendChild(btn);
      });
      bindTooltips(list);
    }catch(e){
      console.error(e);
    }
  }

  // ---------- EXPORT / INIT ----------
  window.OSP = window.OSP || {};
  window.OSP.route = route;
  window.OSP.openAuth = openAuth;
  window.OSP.openNewPost = openNewPost;
  window.OSP.openNewCommunity = openNewCommunity;
  window.OSP.refreshCommunities = refreshCommunities;
  window.OSP.setStateMe = (me)=>{ state.me = me; };
  window.OSP.loggedOut = ()=>{ state.me = null; refreshSidebarMe(); };
  window.OSP.meUpdated = (me)=>{ state.me = me; refreshSidebarMe(); };

  function refreshSidebarMe(){
    const me = state.me;
    const name = $('#meName'), code = $('#meCode'), av = $('#meAvatar');
    const sName = $('#startName'), sAv = $('#startAvatar');
    if (me){
      name.textContent = me.displayName;
      code.textContent = me.userCode;
      if (me.avatar){ av.style.background = 'url('+me.avatar+') center/cover'; av.textContent=''; }
      else {
        av.style.background = 'linear-gradient(135deg,'+me.color+','+shade(me.color,-40)+')';
        av.textContent = (me.displayName||'?').slice(0,1).toUpperCase();
      }
      if (sName) sName.textContent = me.displayName;
      if (sAv){
        if (me.avatar){ sAv.style.background = 'url('+me.avatar+') center/cover'; sAv.textContent=''; }
        else { sAv.style.background = 'linear-gradient(135deg,'+me.color+','+shade(me.color,-40)+')'; sAv.textContent = (me.displayName||'?').slice(0,1).toUpperCase(); }
      }
      $('#newPostBtn').style.display='';
      $('#newPostBtn').classList.remove('hidden');
      const np2=$('#newPostBtn2'); if(np2){ np2.style.display=''; np2.classList.remove('hidden'); }
      $('#logoutBtn').style.display='';
      $('#logoutBtn').classList.remove('hidden');
      $('#startLogout').style.display='';
      $('#startLogout').classList.remove('hidden');
      $('#startLogin').style.display='none';
      $('#startLogin').classList.add('hidden');
      $('#startProfile').style.display='';
      $('#startProfile').classList.remove('hidden');
    } else {
      name.textContent = 'guest';
      code.textContent = 'OSP-??????';
      av.style.background='linear-gradient(135deg,#888,#444)';
      av.textContent='?';
      if (sName) sName.textContent = 'guest';
      if (sAv){ sAv.style.background='linear-gradient(135deg,#888,#444)'; sAv.textContent='?'; }
      $('#newPostBtn').style.display='none';
      $('#newPostBtn').classList.add('hidden');
      const np2=$('#newPostBtn2'); if(np2){ np2.style.display='none'; np2.classList.add('hidden'); }
      $('#logoutBtn').style.display='none';
      $('#logoutBtn').classList.add('hidden');
      $('#startLogout').style.display='none';
      $('#startLogout').classList.add('hidden');
      $('#startLogin').style.display='';
      $('#startLogin').classList.remove('hidden');
      $('#startProfile').style.display='none';
      $('#startProfile').classList.add('hidden');
    }
    // buddy list
    api.users().then(us=>{ if(window.WIN) window.WIN.refreshBuddies(us, me); }).catch(()=>{});
  }

  // bind the permanent shell buttons
  function bindShell(){
    $$('.side-item[data-view]').forEach(b=>{
      b.addEventListener('click',()=>route(b.getAttribute('data-view')));
    });
    const np2=$('#newPostBtn2');
    $('#newPostBtn').addEventListener('click', openNewPost);
    if(np2) np2.addEventListener('click', openNewPost);
    $('#newCommunityBtn').addEventListener('click', openNewCommunity);
    $('#meCard').addEventListener('click',()=>{
      if (state.me) route('profile', state.me.username);
      else openAuth();
    });
    $('#logoutBtn').addEventListener('click',async()=>{
      await api.logout(); window.OSP.loggedOut(); toast('logged out','good'); route('home');
    });
    bindTooltips();
    // start menu profile
    $('#startProfile').addEventListener('click',()=>{ if(state.me) route('profile',state.me.username); else openAuth(); });
  }

  async function initFeed(){
    bindShell();
    await refreshCommunities();
    refreshSidebarMe();
  }

  window.FEED = { init: initFeed, route, state };
})();
