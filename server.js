// ONLYSNACKPACK server
// Static file host + tiny JSON API for posts/comments/communities/users + uploads for photo/music/video.
// Data is persisted to ./data/*.json and ./data/uploads/* so things survive restarts.
// No external database — keeps it dead-simple to run: `npm install && npm start`.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const d of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ---------- tiny JSON "database" ----------
// shape: { users:[], posts:[], comments:[], communities:[], follows:[], adminPosts:[], sessionSecrets:{} }
function emptyDB() {
  return {
    users: [],
    posts: [],
    comments: [],
    communities: [],
    follows: [],        // {follower, following}
    adminPosts: [],     // admin-only feed entries
    sessionSecrets: {}, // token -> username
    joinDates: {},      // username -> ISO string
    guestbook: [],      // {id,name,text,createdAt}
  };
}
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return emptyDB();
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // fill missing keys so old dbs keep working
    const base = emptyDB();
    return Object.assign(base, parsed);
  } catch (e) {
    console.error('db load failed, starting fresh:', e.message);
    return emptyDB();
  }
}
let db = loadDB();
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 80);
}
function uid(prefix = 'id') {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}
function nowISO() { return new Date().toISOString(); }

// ---------- file uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '';
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
    cb(null, uid('f') + '_' + Date.now() + safeExt);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB cap per file
});

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use('/u', express.static(UPLOAD_DIR, { maxAge: '1d' }));
app.use(express.static(PUBLIC));

// ---------- auth (simple token in x-token header) ----------
function randomToken() { return crypto.randomBytes(24).toString('hex'); }
function getUser(req) {
  const token = req.headers['x-token'] || (req.query && req.query.token);
  if (!token) return null;
  const username = db.sessionSecrets[token];
  if (!username) return null;
  return db.users.find(u => u.username === username) || null;
}
function requireUser(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'not logged in' });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  const pw = req.headers['x-admin-password'] || req.body.adminPassword;
  if (pw !== 'packers') return res.status(403).json({ error: 'bad admin password' });
  next();
}

// ---------- helpers ----------
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    displayName: u.displayName || u.username,
    bio: u.bio || '',
    avatar: u.avatar || '',
    color: u.color || '#7df9ff',
    cardBg: u.cardBg || '',
    userCode: u.userCode,
    joinedAt: db.joinDates[u.username] || u.joinedAt || nowISO(),
  };
}
function serializePost(p) {
  const author = db.users.find(u => u.username === p.author);
  const community = p.communityId ? db.communities.find(c => c.id === p.communityId) : null;
  const commentCount = db.comments.filter(c => c.postId === p.id).length;
  return {
    id: p.id,
    text: p.text || '',
    photo: p.photo || '',
    music: p.music || null,
    video: p.video || '',
    author: publicUser(author),
    communityId: p.communityId || null,
    community: community ? { id: community.id, name: community.name, color: community.color, icon: community.icon } : null,
    createdAt: p.createdAt,
    likes: p.likes || 0,
    likedBy: p.likedBy || [],
    commentCount,
    template: p.template || 'default',
  };
}

// ---------- auth routes ----------
app.post('/api/signup', (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'need username + password' });
  const clean = String(username).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  if (clean.length < 2) return res.status(400).json({ error: 'username bad (letters/numbers/-_ only, 2-20)' });
  if (String(username).trim().toLowerCase() !== clean) return res.status(400).json({ error: 'username bad (letters/numbers/-_ only, 2-20)' });
  if (db.users.find(u => u.username === clean)) return res.status(400).json({ error: 'username taken' });
  const userCode = 'OSP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const palette = ['#7df9ff','#ff6ec7','#c0ff00','#ffb347','#b388ff','#ff5b5b','#4aff8c','#ffea00'];
  const user = {
    username: clean,
    password: String(password), // plain for this toy site; stored server-side only
    displayName: displayName || clean,
    bio: '',
    avatar: '',
    color: palette[Math.floor(Math.random() * palette.length)],
    cardBg: '',
    userCode,
  };
  db.users.push(user);
  db.joinDates[clean] = nowISO();
  const token = randomToken();
  db.sessionSecrets[token] = clean;
  saveDB();
  res.json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const clean = String(username || '').trim().toLowerCase();
  const u = db.users.find(x => x.username === clean);
  if (!u || u.password !== String(password)) return res.status(401).json({ error: 'bad username or password' });
  const token = randomToken();
  db.sessionSecrets[token] = u.username;
  saveDB();
  res.json({ token, user: publicUser(u) });
});

app.post('/api/logout', requireUser, (req, res) => {
  const token = req.headers['x-token'];
  delete db.sessionSecrets[token];
  saveDB();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  if (!u) return res.json({ user: null });
  res.json({ user: publicUser(u) });
});

app.patch('/api/me', requireUser, (req, res) => {
  const allowed = ['displayName','bio','avatar','color','cardBg','password'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) req.user[k] = String(req.body[k]).slice(0, k === 'bio' ? 280 : 120);
  }
  saveDB();
  res.json({ user: publicUser(req.user) });
});

// ---------- uploads ----------
app.post('/api/upload/photo', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: '/u/' + req.file.filename });
});
app.post('/api/upload/music', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const title = (req.body && req.body.title) || 'untitled';
  const track = {
    id: uid('m'),
    title: String(title).slice(0, 80),
    url: '/u/' + req.file.filename,
    author: req.user.username,
    createdAt: nowISO(),
  };
  if (!db.music) db.music = [];
  db.music.push(track);
  saveDB();
  res.json({ url: track.url, track });
});
app.post('/api/upload/video', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: '/u/' + req.file.filename });
});

// ---------- users ----------
app.get('/api/users', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  let list = db.users.map(publicUser);
  if (q) list = list.filter(u => u.username.includes(q) || (u.displayName||'').toLowerCase().includes(q));
  list.sort((a,b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  res.json({ users: list });
});
app.get('/api/users/:username', (req, res) => {
  const u = db.users.find(x => x.username === req.params.username.toLowerCase());
  if (!u) return res.status(404).json({ error: 'no user' });
  const posts = db.posts.filter(p => p.author === u.username).map(serializePost).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const followers = db.follows.filter(f => f.following === u.username).length;
  const following = db.follows.filter(f => f.follower === u.username).length;
  const me = getUser(req);
  let isFollowing = false;
  if (me) isFollowing = db.follows.some(f => f.follower === me.username && f.following === u.username);
  res.json({ user: publicUser(u), posts, followers, following, isFollowing });
});

// ---------- follows ----------
app.post('/api/follow/:username', requireUser, (req, res) => {
  const target = req.params.username.toLowerCase();
  if (target === req.user.username) return res.status(400).json({ error: 'cant follow yourself' });
  if (!db.users.find(u => u.username === target)) return res.status(404).json({ error: 'no user' });
  const exists = db.follows.find(f => f.follower === req.user.username && f.following === target);
  if (!exists) db.follows.push({ follower: req.user.username, following: target, since: nowISO() });
  saveDB();
  res.json({ ok: true, following: true });
});
app.post('/api/unfollow/:username', requireUser, (req, res) => {
  const target = req.params.username.toLowerCase();
  db.follows = db.follows.filter(f => !(f.follower === req.user.username && f.following === target));
  saveDB();
  res.json({ ok: true, following: false });
});

// ---------- communities ----------
app.get('/api/communities', (req, res) => {
  res.json({ communities: db.communities.map(c => ({
    id: c.id, name: c.name, description: c.description, color: c.color, icon: c.icon,
    creator: c.creator, createdAt: c.createdAt, memberCount: (c.members||[]).length,
    members: c.members || [],
    bgImage: c.bgImage || '',
  }))});
});
app.post('/api/communities', requireUser, (req, res) => {
  const { name, description, color, icon } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name needed' });
  const cleanName = String(name).trim().slice(0, 28);
  const c = {
    id: uid('c'),
    name: cleanName,
    description: String(description||'').slice(0, 200),
    color: String(color||'#7df9ff'),
    icon: String(icon||'◉'),
    bgImage: '',
    creator: req.user.username,
    createdAt: nowISO(),
    members: [req.user.username],
    customCss: '',
  };
  db.communities.push(c);
  saveDB();
  res.json({ community: c });
});
app.patch('/api/communities/:id', requireUser, (req, res) => {
  const c = db.communities.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'no community' });
  if (c.creator !== req.user.username) return res.status(403).json({ error: 'only creator can edit' });
  const keys = ['name','description','color','icon','bgImage','customCss'];
  for (const k of keys) if (req.body[k] !== undefined) c[k] = String(req.body[k]).slice(0, k==='customCss'?2000:200);
  saveDB();
  res.json({ community: c });
});
app.post('/api/communities/:id/join', requireUser, (req, res) => {
  const c = db.communities.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'no community' });
  if (!c.members.includes(req.user.username)) c.members.push(req.user.username);
  saveDB();
  res.json({ ok: true, members: c.members.length });
});
app.post('/api/communities/:id/leave', requireUser, (req, res) => {
  const c = db.communities.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'no community' });
  c.members = c.members.filter(m => m !== req.user.username);
  saveDB();
  res.json({ ok: true, members: c.members.length });
});

// ---------- posts ----------
// posts can have communityId=null, which means posted to the main feed (no community needed).
app.get('/api/posts', (req, res) => {
  let list = db.posts.slice();
  const communityId = req.query.communityId;
  const author = req.query.author;
  const feed = req.query.feed; // 'following' or 'main' or 'all'
  if (communityId) list = list.filter(p => p.communityId === communityId);
  if (author) list = list.filter(p => p.author === author);
  if (feed === 'main') list = list.filter(p => !p.communityId);
  if (feed === 'following') {
    const me = getUser(req);
    if (me) {
      const foll = db.follows.filter(f => f.follower === me.username).map(f => f.following);
      list = list.filter(p => p.author === me.username || foll.includes(p.author));
    } else {
      list = list.filter(p => !p.communityId);
    }
  }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const limit = Math.min(80, parseInt(req.query.limit||'40',10));
  res.json({ posts: list.slice(0, limit).map(serializePost) });
});
app.post('/api/posts', requireUser, (req, res) => {
  const { text, photo, music, video, communityId, template } = req.body || {};
  if (!text && !photo && !video && !music) return res.status(400).json({ error: 'post empty' });
  if (communityId) {
    const c = db.communities.find(x => x.id === communityId);
    if (!c) return res.status(400).json({ error: 'bad community' });
    // you can view the main feed without joining, but to post INTO a community you must be a member.
    if (!c.members.includes(req.user.username)) c.members.push(req.user.username);
  }
  const p = {
    id: uid('p'),
    text: String(text||'').slice(0, 1200),
    photo: photo || '',
    music: music || null,   // {title, url}
    video: video || '',
    author: req.user.username,
    communityId: communityId || null,
    createdAt: nowISO(),
    likes: 0,
    likedBy: [],
    template: template || 'default',
  };
  db.posts.push(p);
  saveDB();
  res.json({ post: serializePost(p) });
});
app.delete('/api/posts/:id', requireUser, (req, res) => {
  const p = db.posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'no post' });
  if (p.author !== req.user.username) return res.status(403).json({ error: 'not your post' });
  db.posts = db.posts.filter(x => x.id !== p.id);
  db.comments = db.comments.filter(c => c.postId !== p.id);
  saveDB();
  res.json({ ok: true });
});
app.post('/api/posts/:id/like', requireUser, (req, res) => {
  const p = db.posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'no post' });
  p.likedBy = p.likedBy || [];
  if (p.likedBy.includes(req.user.username)) {
    p.likedBy = p.likedBy.filter(u => u !== req.user.username);
  } else {
    p.likedBy.push(req.user.username);
  }
  p.likes = p.likedBy.length;
  saveDB();
  res.json({ likes: p.likes, liked: p.likedBy.includes(req.user.username) });
});

// ---------- comments (speech bubble) ----------
app.get('/api/posts/:id/comments', (req, res) => {
  const list = db.comments
    .filter(c => c.postId === req.params.id)
    .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(c => {
      const author = db.users.find(u => u.username === c.author);
      return {
        id: c.id,
        postId: c.postId,
        text: c.text,
        author: publicUser(author),
        createdAt: c.createdAt,
      };
    });
  res.json({ comments: list });
});
app.post('/api/posts/:id/comments', requireUser, (req, res) => {
  const p = db.posts.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'no post' });
  const text = String((req.body||{}).text||'').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'empty comment' });
  const c = {
    id: uid('cm'),
    postId: p.id,
    text,
    author: req.user.username,
    createdAt: nowISO(),
  };
  db.comments.push(c);
  saveDB();
  res.json({ comment: { ...c, author: publicUser(req.user) } });
});
app.delete('/api/comments/:id', requireUser, (req, res) => {
  const c = db.comments.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'no comment' });
  if (c.author !== req.user.username) return res.status(403).json({ error: 'not yours' });
  db.comments = db.comments.filter(x => x.id !== c.id);
  saveDB();
  res.json({ ok: true });
});

// ---------- music library ----------
app.get('/api/music', (req, res) => {
  const list = (db.music||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({ music: list.map(m => ({ ...m, authorUser: publicUser(db.users.find(u => u.username === m.author)) })) });
});

// ---------- admin (ONLYSNACKPACK zone, password packers) ----------
app.get('/api/admin/posts', requireAdmin, (req, res) => {
  res.json({ posts: db.adminPosts });
});
app.post('/api/admin/posts', requireAdmin, (req, res) => {
  const { kind, url, caption, title } = req.body || {};
  if (!['photo','video','text'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
  const post = {
    id: uid('ap'),
    kind, url: url||'', caption: String(caption||'').slice(0,500),
    title: String(title||'ONLYSNACKPACK').slice(0,80),
    createdAt: nowISO(),
  };
  db.adminPosts.unshift(post);
  saveDB();
  res.json({ post });
});
app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  db.adminPosts = db.adminPosts.filter(p => p.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});
// public read of admin zone (everyone logs in to *see* — "everyone can log in and see")
app.get('/api/admin/public', (req, res) => {
  res.json({ posts: db.adminPosts, name: 'ONLYSNACKPACK' });
});
app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: '/u/' + req.file.filename });
});

// ---------- guestbook ----------
app.get('/api/guestbook', (req,res)=>{
  const list = db.guestbook.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({entries: list});
});
app.post('/api/guestbook', (req,res)=>{
  const u = getUser(req);
  const { text } = req.body||{};
  const clean = String(text||'').trim().slice(0,300);
  if (!clean) return res.status(400).json({error:'empty'});
  const name = u ? u.displayName+' (@'+u.username+')' : String((req.body.name||'anon')).slice(0,32);
  const entry = { id: uid('g'), name: name||'anon', text: clean, createdAt: nowISO() };
  db.guestbook.push(entry);
  saveDB();
  res.json({entry});
});

// ---------- misc / stats ----------
app.get('/api/stats', (req, res) => {
  res.json({
    users: db.users.length,
    posts: db.posts.length,
    comments: db.comments.length,
    communities: db.communities.length,
    serverTime: nowISO(),
  });
});

// catch-all for client-side routing style refreshes (we don't use a router, but safe)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('ONLYSNACKPACK running on http://localhost:' + PORT);
});
