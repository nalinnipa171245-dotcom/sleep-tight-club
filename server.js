const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DateTime } = require('luxon');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admintoken';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  posts: path.join(DATA_DIR, 'posts.json'),
  comments: path.join(DATA_DIR, 'comments.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  interactions: path.join(DATA_DIR, 'interactions.json'),
  mods: path.join(DATA_DIR, 'mod_logs.json')
};

function load(fn, defaultVal) {
  try {
    if (!fs.existsSync(fn)) {
      fs.writeFileSync(fn, JSON.stringify(defaultVal,null,2));
      return defaultVal;
    }
    const text = fs.readFileSync(fn,'utf8');
    return JSON.parse(text || 'null') || defaultVal;
  } catch(e) {
    console.error('load error',fn,e);
    return defaultVal;
  }
}
function save(fn, obj) {
  fs.writeFileSync(fn, JSON.stringify(obj,null,2));
}

let USERS = load(FILES.users, {});
let POSTS = load(FILES.posts, {});
let COMMENTS = load(FILES.comments, {});
let MESSAGES = load(FILES.messages, {});
let INTERACTIONS = load(FILES.interactions, {});
let MODS = load(FILES.mods, []);

function persistAll() {
  save(FILES.users, USERS);
  save(FILES.posts, POSTS);
  save(FILES.comments, COMMENTS);
  save(FILES.messages, MESSAGES);
  save(FILES.interactions, INTERACTIONS);
  save(FILES.mods, MODS);
}

function isOpenNow() {
  const now = DateTime.now().setZone(TIMEZONE);
  const hour = now.hour;
  return (hour >= 0 && hour < 4);
}

function timeGate(req, res, next) {
  const vip = req.headers['x-vip'] === '1' || (req.user && req.user.isVip);
  if (isOpenNow() || vip) return next();
  return res.status(403).json({ error: 'Club is closed. Open 00:00-04:00 (Asia/Bangkok)' });
}

function auth(req, res, next) {
  const uid = req.headers['x-user-id'] || null;
  if (!uid || !USERS[uid]) {
    return res.status(401).json({ error: 'unauthenticated (demo). Provide x-user-id header.' });
  }
  req.user = USERS[uid];
  next();
}

function adminAuth(req, res, next) {
  const t = req.headers['x-admin-token'] || '';
  if (t !== ADMIN_TOKEN) return res.status(403).json({ error: 'forbidden' });
  next();
}

app.get('/api/status', (req, res) => {
  const now = DateTime.now().setZone(TIMEZONE);
  res.json({ open: isOpenNow(), now: now.toISO(), timezone: TIMEZONE, opens_at:'00:00', closes_at:'04:00' });
});

app.post('/api/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const exists = Object.values(USERS).find(u => u.email === email);
  if (exists) return res.status(400).json({ error: 'email already registered' });
  const id = uuidv4();
  const st_id = 'ST-' + Math.floor(10000 + Math.random()*90000);
  USERS[id] = { id, email, passwordHash: password, isVip: false, st_id, createdAt: new Date().toISOString() };
  persistAll();
  res.json({ message: 'created', user: { id, email, isVip: false, st_id } });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = Object.values(USERS).find(u => u.email === email && u.passwordHash === password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const token = Buffer.from(user.id).toString('base64');
  res.json({ token, user: { id: user.id, email: user.email, isVip: user.isVip, st_id: user.st_id } });
});

app.get('/api/me', auth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, email: u.email, isVip: u.isVip, st_id: u.st_id });
});

app.post('/api/posts', auth, timeGate, (req, res) => {
  const { content } = req.body;
  if (!content || content.trim().length === 0) return res.status(400).json({ error: 'content required' });
  const id = uuidv4();
  const approved = req.user.isVip ? true : false;
  POSTS[id] = { id, userId: req.user.id, content: content.slice(0,2000), image:null, pinned: false, approved, createdAt: new Date().toISOString() };
  persistAll();
  res.json({ message: 'post created', post: POSTS[id] });
});

app.get('/api/posts', (req, res) => {
  const arr = Object.values(POSTS).filter(p => p.approved).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  res.json({ posts: arr });
});

app.get('/api/posts/:id', (req, res) => {
  const p = POSTS[req.params.id];
  if (!p) return res.status(404).json({ error: 'not found' });
  const comments = Object.values(COMMENTS).filter(c=>c.postId===p.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  res.json({ post: p, comments });
});

app.post('/api/posts/:id/comments', auth, timeGate, (req, res) => {
  const post = POSTS[req.params.id];
  if (!post) return res.status(404).json({ error: 'post not found' });
  const { content } = req.body;
  if (!content || content.trim().length===0) return res.status(400).json({ error: 'content required' });
  const id = uuidv4();
  COMMENTS[id] = { id, postId: post.id, userId: req.user.id, content: content.slice(0,1000), createdAt: new Date().toISOString() };
  const owner = post.userId;
  const a = owner < req.user.id ? owner+':'+req.user.id : req.user.id+':'+owner;
  INTERACTIONS[a] = (INTERACTIONS[a] || 0) + 1;
  persistAll();
  res.json({ message: 'comment created', comment: COMMENTS[id] });
});

app.post('/api/messages', auth, (req, res) => {
  const { toUserId, content } = req.body;
  if (!toUserId || !USERS[toUserId]) return res.status(400).json({ error: 'invalid recipient' });
  const pair = req.user.id < toUserId ? req.user.id+':'+toUserId : toUserId+':'+req.user.id;
  const allowed = req.user.isVip || USERS[toUserId].isVip || (INTERACTIONS[pair] && INTERACTIONS[pair] >= 3);
  if (!allowed) return res.status(403).json({ error: 'cannot message yet — interact 3 times in same thread first (demo) or upgrade to VIP' });
  const id = uuidv4();
  MESSAGES[id] = { id, from: req.user.id, to: toUserId, content: content.slice(0,1000), createdAt: new Date().toISOString() };
  persistAll();
  res.json({ message: 'sent', msg: MESSAGES[id] });
});

app.get('/api/messages', auth, (req, res) => {
  const list = Object.values(MESSAGES).filter(m => m.to === req.user.id || m.from === req.user.id).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  res.json({ messages: list });
});

app.get('/api/mod/pending', adminAuth, (req, res) => {
  const pending = Object.values(POSTS).filter(p => !p.approved);
  res.json({ pending });
});

app.post('/api/mod/approve', adminAuth, (req, res) => {
  const { postId } = req.body;
  if (!POSTS[postId]) return res.status(404).json({ error: 'post not found' });
  POSTS[postId].approved = true;
  MODS.push({ id: uuidv4(), action: 'approve', target: postId, when: new Date().toISOString() });
  persistAll();
  res.json({ message: 'approved' });
});

app.post('/api/mod/remove', adminAuth, (req, res) => {
  const { postId, reason } = req.body;
  if (!POSTS[postId]) return res.status(404).json({ error: 'post not found' });
  delete POSTS[postId];
  MODS.push({ id: uuidv4(), action: 'remove', target: postId, reason: reason || '', when: new Date().toISOString() });
  persistAll();
  res.json({ message: 'removed' });
});

function scheduleDailyReset() {
  const now = DateTime.now().setZone(TIMEZONE);
  let next = now.set({ hour:4, minute:0, second:0, millisecond:0 });
  if (now >= next) next = next.plus({ days:1 });
  const ms = next.toJSDate() - now.toJSDate();
  setTimeout(() => {
    Object.keys(POSTS).forEach(k => { if (!POSTS[k].pinned) delete POSTS[k]; });
    MODS.push({ id: uuidv4(), action: 'daily_reset', when: new Date().toISOString() });
    persistAll();
    scheduleDailyReset();
  }, ms);
}

app.post('/api/admin/reset', adminAuth, (req, res) => {
  Object.keys(POSTS).forEach(k => { if (!POSTS[k].pinned) delete POSTS[k]; });
  MODS.push({ id: uuidv4(), action: 'manual_reset', when: new Date().toISOString() });
  persistAll();
  res.json({ message: 'reset done' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/timeline', (req, res) => res.sendFile(path.join(__dirname, 'public', 'timeline.html')));

scheduleDailyReset();
app.listen(PORT, () => console.log(`Sleep Tight server running on http://localhost:${PORT}`));
