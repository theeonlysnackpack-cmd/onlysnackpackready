// Tiny API client. Saves the session token to localStorage so you stay logged in.
(function(){
  const TOKEN_KEY = 'osp_token_v1';
  let token = localStorage.getItem(TOKEN_KEY) || null;

  async function req(method, url, body, opts){
    opts = opts || {};
    const headers = Object.assign({ 'x-token': token || '' }, opts.headers || {});
    let data;
    if (body instanceof FormData) {
      data = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      data = JSON.stringify(body);
    }
    const r = await fetch(url, { method, headers, body: data });
    const text = await r.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch(e){ json = { raw: text }; }
    if (!r.ok) {
      const err = new Error(json.error || ('HTTP ' + r.status));
      err.status = r.status; err.body = json; throw err;
    }
    return json;
  }

  const api = {
    get token(){ return token; },
    get loggedIn(){ return !!token; },

    async signup(username, password, displayName){
      const r = await req('POST','/api/signup',{username,password,displayName});
      token = r.token; localStorage.setItem(TOKEN_KEY, token); return r.user;
    },
    async login(username, password){
      const r = await req('POST','/api/login',{username,password});
      token = r.token; localStorage.setItem(TOKEN_KEY, token); return r.user;
    },
    async logout(){
      try { await req('POST','/api/logout',{}); } catch(e){}
      token = null; localStorage.removeItem(TOKEN_KEY);
    },
    async me(){
      if (!token) return null;
      try { const r = await req('GET','/api/me'); return r.user; } catch(e){ token = null; localStorage.removeItem(TOKEN_KEY); return null; }
    },
    async saveMe(patch){ return (await req('PATCH','/api/me', patch)).user; },

    async users(q){ return (await req('GET','/api/users'+(q?('?q='+encodeURIComponent(q)):''))).users; },
    async userProfile(username){ return req('GET','/api/users/'+encodeURIComponent(username)); },

    async follow(username){ return req('POST','/api/follow/'+encodeURIComponent(username),{}); },
    async unfollow(username){ return req('POST','/api/unfollow/'+encodeURIComponent(username),{}); },

    async communities(){ return (await req('GET','/api/communities')).communities; },
    async createCommunity(p){ return (await req('POST','/api/communities', p)).community; },
    async editCommunity(id, patch){ return (await req('PATCH','/api/communities/'+id, patch)).community; },
    async joinCommunity(id){ return req('POST','/api/communities/'+id+'/join',{}); },
    async leaveCommunity(id){ return req('POST','/api/communities/'+id+'/leave',{}); },

    async posts(opts){
      opts = opts || {};
      const q = new URLSearchParams();
      if (opts.communityId) q.set('communityId', opts.communityId);
      if (opts.author) q.set('author', opts.author);
      if (opts.feed) q.set('feed', opts.feed);
      if (opts.limit) q.set('limit', opts.limit);
      return (await req('GET','/api/posts?'+q.toString())).posts;
    },
    async createPost(p){ return (await req('POST','/api/posts', p)).post; },
    async deletePost(id){ return req('DELETE','/api/posts/'+id, {}); },
    async likePost(id){ return req('POST','/api/posts/'+id+'/like',{}); },
    async comments(id){ return (await req('GET','/api/posts/'+id+'/comments')).comments; },
    async addComment(id, text){ return (await req('POST','/api/posts/'+id+'/comments',{text})).comment; },
    async deleteComment(id){ return req('DELETE','/api/comments/'+id, {}); },

    async uploadPhoto(file){
      const fd = new FormData(); fd.append('file', file);
      return req('POST','/api/upload/photo', fd);
    },
    async uploadMusic(file, title){
      const fd = new FormData(); fd.append('file', file); if (title) fd.append('title', title);
      return req('POST','/api/upload/music', fd);
    },
    async uploadVideo(file){
      const fd = new FormData(); fd.append('file', file);
      return req('POST','/api/upload/video', fd);
    },
    async music(){ return (await req('GET','/api/music')).music; },

    async adminCheck(pw){
      return req('GET','/api/admin/posts', null, { headers:{'x-admin-password':pw} });
    },
    async adminPosts(pw){ return (await req('GET','/api/admin/posts', null, { headers:{'x-admin-password':pw} })).posts; },
    async adminPublic(){ return (await req('GET','/api/admin/public')); },
    async adminPost(pw, p){
      return (await req('POST','/api/admin/posts', Object.assign({adminPassword:pw}, p))).post;
    },
    async adminUpload(pw, file){
      const fd = new FormData(); fd.append('file', file); fd.append('adminPassword', pw);
      return req('POST','/api/admin/upload', fd);
    },
    async adminDelete(pw, id){ return req('DELETE','/api/admin/posts/'+id, {adminPassword:pw}); },

    async stats(){ return req('GET','/api/stats'); },
  };

  window.api = api;
})();
