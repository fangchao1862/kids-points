'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
// 路径解析：探测项目根（public/ 所在目录）
//  - 本地运行: __dirname=.../functions/kids-points，public 在 ../../public（项目根）
//  - Docker 容器: __dirname=/app/functions/kids-points，public 在 /app/public（项目根 /app）
//  - 老式云函数: __dirname=/var/user，public 就在 /var/user/public
function resolveRoot() {
  const candidates = [__dirname, path.join(__dirname, '..'), path.join(__dirname, '..', '..')];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'public'))) return c;
  }
  return path.join(__dirname, '..'); // 兜底
}
const ROOT_DIR = resolveRoot();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');

const AVATARS = ['🦊', '🐼', '🐯', '🐰', '🐻', '🐸', '🐵', '🐧', '🦁', '🐨', '🐷', '🐤', '🦄', '🐙', '🐬', '🦕'];

/* ---------------- 数据层 ---------------- */
// 三选一持久化（按优先级自动降级，容器重启 / 重新部署数据都不丢）：
//  1) PostgreSQL —— 云主机部署（Render / Railway / VPS），靠 DATABASE_URL 启用
//  2) CloudBase NoSQL 云数据库 —— 云函数环境，靠 TCB_MODE=1 + TCB_ENV_ID 启用
//  3) 本地 data/data.json —— 本地开发兜底
let db;

/* --- PostgreSQL（Render / Railway / VPS 首选） --- */
let pgPool = null;
const DATABASE_URL = process.env.DATABASE_URL || '';

// 托管商差异：有的数据库要求 SSL（自签证书），有的内网直连不支持 SSL。
// 这里先试 SSL，失败自动回落明文，确保两种环境都能连上。
async function initPg() {
  if (!DATABASE_URL || pgPool) return pgPool;
  let lastErr = null;
  try {
    const { Pool } = require('pg');
    for (const ssl of [{ rejectUnauthorized: false }, false]) {
      let pool = null;
      try {
        pool = new Pool({
          connectionString: DATABASE_URL,
          ssl,
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 8000,
        });
        // 立即建立一次连接验证可用性（Pool 默认懒连接）
        const client = await pool.connect();
        client.release();
        pgPool = pool;
        console.log(`[存储] 已启用 PostgreSQL 持久化${ssl ? '（SSL 连接）' : '（明文连接）'}`);
        return pgPool;
      } catch (e) {
        lastErr = e;
        if (pool) { try { await pool.end(); } catch (_) { /* 忽略 */ } }
      }
    }
  } catch (e) {
    lastErr = e; // 未安装 pg 依赖
  }
  console.warn('[存储] PostgreSQL 连接失败，降级到其它存储:', lastErr && lastErr.message);
  return null;
}

// 建表（幂等）
async function pgInit() {
  if (!pgPool) return;
  try {
    await pgPool.query(`CREATE TABLE IF NOT EXISTS kids_store_data (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at bigint
    )`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS kids_store_images (
      name text PRIMARY KEY,
      mime text,
      data text,
      created_at bigint
    )`);
  } catch (e) {
    console.error('[存储] PostgreSQL 建表失败:', e.message);
  }
}

// CloudBase 初始化（云函数通过环境变量 TCB_MODE=1 + TCB_ENV_ID 启用）
let tcbApp = null;
const TCB_ENV_ID = process.env.TCB_ENV_ID || '';
const DB_COL = 'kids_store_data';
const IMG_COL = 'kids_store_images';
if (process.env.TCB_MODE === '1' && TCB_ENV_ID) {
  try {
    const tcb = require('@cloudbase/node-sdk');
    tcbApp = tcb.init({ env: TCB_ENV_ID });
    console.log(`[存储] 已启用云开发数据库持久化（env: ${TCB_ENV_ID}）`);
  } catch (e) {
    console.warn('[存储] CloudBase 初始化失败，回退本地文件存储:', e.message);
    tcbApp = null;
  }
}

function seedDb() {
  const now = Date.now();
  return {
    adminPassword: 'admin123',
    gifts: [
      { name: '冰淇淋甜筒', emoji: '🍦', points: 10 },
      { name: '棉花糖', emoji: '🍬', points: 8 },
      { name: '多看一小时动画片', emoji: '📺', points: 20 },
      { name: '绘本一本', emoji: '📚', points: 30 },
      { name: '盲盒玩具', emoji: '🎁', points: 50 },
      { name: '恐龙玩具', emoji: '🦖', points: 80 },
      { name: '机器人玩具', emoji: '🤖', points: 100 },
      { name: '乐高积木一盒', emoji: '🧱', points: 150 },
    ].map((g, i) => ({ id: i + 1, image: '', onShelf: true, createdAt: now, ...g })),
    kids: [{ id: 101, name: '小明', avatar: '🐼', points: 100, createdAt: now }],
    requests: [],
    history: [{ id: 1, kidId: 101, kidName: '小明', delta: 100, reason: '初始积分', time: now }],
    seq: 1000,
  };
}

async function loadDb() {
  // 1) PostgreSQL
  await initPg();
  if (pgPool) {
    try {
      await pgInit();
      const r = await pgPool.query('SELECT payload FROM kids_store_data WHERE id = $1', ['main']);
      if (r.rows.length && r.rows[0].payload) {
        db = r.rows[0].payload;
        console.log('[存储] 已从 PostgreSQL 恢复数据');
        return;
      }
    } catch (e) {
      console.warn('[存储] PostgreSQL 读取失败（可能是首次运行）:', e.message);
    }
  }
  // 2) CloudBase 云数据库
  if (tcbApp) {
    try {
      const res = await tcbApp.database().collection(DB_COL).doc('main').get();
      if (res && res.data && res.data.payload) {
        db = JSON.parse(res.data.payload);
        console.log('[存储] 已从云数据库恢复数据');
        return;
      }
    } catch (e) {
      console.warn('[存储] 云数据库读取失败（可能是首次运行）:', e.message);
    }
  }
  // 3) 本地文件
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return;
  } catch (e) { /* 本地无数据文件，使用种子数据 */ }
  db = seedDb();
  saveDb();
}

let saveTimer = null;
function saveDb() {
  // 本地文件（云主机下只读或易失也无妨，写入失败被吞掉，不影响主流程）
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { /* 只读环境跳过 */ }
  // PostgreSQL（200ms 防抖，多次保存合并为一次写入）
  if (pgPool) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await pgPool.query(
          `INSERT INTO kids_store_data (id, payload, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
          ['main', JSON.stringify(db), Date.now()]
        );
      } catch (e) { console.error('[存储] PostgreSQL 写入失败:', e.message); }
    }, 200);
    return;
  }
  // CloudBase 云数据库（200ms 防抖，多次保存合并为一次写入）
  if (tcbApp) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await tcbApp.database().collection(DB_COL).doc('main').set({
          payload: JSON.stringify(db),
          updatedAt: Date.now(),
        });
      } catch (e) { console.error('[存储] 云数据库写入失败:', e.message); }
    }, 200);
  }
}

// 优雅退出：Render 停机会发 SIGTERM，把防抖中还没写入的数据立刻落库
async function flushPending() {
  if (!pgPool || !db) return;
  clearTimeout(saveTimer);
  try {
    await pgPool.query(
      `INSERT INTO kids_store_data (id, payload, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      ['main', JSON.stringify(db), Date.now()]
    );
  } catch (e) { console.error('[存储] 退出前落库失败:', e.message); }
}
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    await flushPending();
    process.exit(0);
  });
}
const nextId = () => db.seq++;
const findKid = id => db.kids.find(k => k.id === Number(id));
const findGift = id => db.gifts.find(g => g.id === Number(id));
function addHistory(kid, delta, reason) {
  db.history.unshift({ id: nextId(), kidId: kid.id, kidName: kid.name, delta, reason, time: Date.now() });
}

/* ---------------- 应用 ---------------- */
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(ROOT_DIR, 'public', 'admin.html')));

// 礼品图片：优先本地磁盘，其次云数据库（云函数模式下图片存于数据库）
const imgCache = new Map();
app.get('/uploads/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const local = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(local)) return res.sendFile(local);
  // PostgreSQL（云主机部署时图片存在表里，容器重启不丢）
  if (pgPool) {
    try {
      const r = await pgPool.query('SELECT mime, data FROM kids_store_images WHERE name = $1', [name]);
      if (r.rows.length && r.rows[0].data) {
        res.set('Content-Type', r.rows[0].mime || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(r.rows[0].data, 'base64'));
      }
    } catch (e) { /* 无此图片，继续往下 */ }
  }
  if (tcbApp) {
    let hit = imgCache.get(name);
    if (!hit) {
      try {
        const r = await tcbApp.database().collection(IMG_COL).doc(name).get();
        if (r && r.data && r.data.data) {
          hit = { mime: r.data.mime || 'image/jpeg', buf: Buffer.from(r.data.data, 'base64') };
          if (imgCache.size > 200) imgCache.clear();
          imgCache.set(name, hit);
        }
      } catch (e) { /* 无此图片 */ }
    }
    if (hit) {
      res.set('Content-Type', hit.mime);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(hit.buf);
    }
  }
  res.status(404).end();
});

// 健康检查 / 存储模式（部署后用它确认到底用了哪种持久化）
app.get('/api/health', async (req, res) => {
  let storage = 'local-file';
  if (pgPool) storage = 'postgres';
  else if (tcbApp) storage = 'cloudbase';

  let dbConnected = false;
  if (pgPool) {
    try {
      await pgPool.query('SELECT 1');
      dbConnected = true;
    } catch (e) { dbConnected = false; }
  }
  res.json({
    ok: true,
    storage,
    // postgres 模式下 false 表示连库失败（数据会退回本地文件，重启丢失）
    dbConnected: pgPool ? dbConnected : undefined,
    kids: db ? db.kids.length : 0,
  });
});

/* ---------- 管理员登录 ---------- */
const sessions = new Map(); // token -> 过期时间
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) return res.status(401).json({ error: '登录已过期，请重新登录' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== db.adminPassword) return res.status(400).json({ error: '老师，密码输入不对哦，请重新输入' });
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 24 * 3600 * 1000);
  res.json({ token });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const p = String((req.body || {}).password || '');
  if (p.length < 4) return res.status(400).json({ error: '老师，新密码至少要 4 位哦' });
  db.adminPassword = p;
  saveDb();
  res.json({ ok: true });
});

/* ---------- 工具接口 ---------- */
// 公网地址（云函数部署时从环境变量 PUBLIC_HOST 读取）
app.get('/api/network', (req, res) => {
  const publicHost = process.env.PUBLIC_HOST || '';
  if (publicHost) {
    return res.json({ ip: '', port: '', url: publicHost + '/' });
  }
  let ip = '';
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) { ip = ni.address; break; }
    }
    if (ip) break;
  }
  res.json({ ip, port: PORT, url: `http://${ip || 'localhost'}:${PORT}/` });
});

// 二维码图片
app.get('/api/qrcode', async (req, res) => {
  try {
    const buf = await QRCode.toBuffer(String(req.query.text || ''), { width: 512, margin: 2 });
    res.type('image/png').send(buf);
  } catch (e) {
    res.status(400).json({ error: '生成二维码失败' });
  }
});

// 礼品图片上传（云函数存入云数据库，本地运行存入 uploads/ 目录）
app.post('/api/admin/upload', requireAdmin,
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '5mb' }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: '老师，请选择 png/jpg/webp/gif 格式的图片' });
    const mime = req.headers['content-type'];
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[mime] || '.png';
    const name = 'gift_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext;
    // PostgreSQL 优先（云主机本地磁盘易失，容器重启会丢）
    if (pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO kids_store_images (name, mime, data, created_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`,
          [name, mime, req.body.toString('base64'), Date.now()]
        );
        return res.json({ url: '/uploads/' + name });
      } catch (e) {
        return res.status(500).json({ error: '老师，图片保存失败了：' + e.message });
      }
    }
    if (tcbApp) {
      try {
        await tcbApp.database().collection(IMG_COL).doc(name).set({
          mime, data: req.body.toString('base64'), createdAt: Date.now(),
        });
        return res.json({ url: '/uploads/' + name });
      } catch (e) {
        return res.status(500).json({ error: '老师，图片保存失败了：' + e.message });
      }
    }
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
    res.json({ url: '/uploads/' + name });
  });

/* ---------- 孩子端（公开接口） ---------- */
// 输入名字登录
app.post('/api/kid/login', (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: '请输入名字哦~' });
  const kid = db.kids.find(k => k.name === name);
  if (!kid) return res.status(400).json({ error: '没有找到这个名字，问问爸爸妈妈是不是打错了？' });
  res.json({ id: kid.id, name: kid.name, avatar: kid.avatar });
});

// 账号列表（备用）
app.get('/api/kids', (req, res) => {
  res.json(db.kids.map(k => ({ id: k.id, name: k.name, avatar: k.avatar })));
});

// 首页：积分 + 在架礼品
app.get('/api/kid/:id/home', (req, res) => {
  const kid = findKid(req.params.id);
  if (!kid) return res.status(404).json({ error: '老师没有找到你的账号，请退出后重新登录哦' });
  res.json({
    kid: { id: kid.id, name: kid.name, avatar: kid.avatar, points: kid.points },
    gifts: db.gifts.filter(g => g.onShelf)
      .map(g => ({ id: g.id, name: g.name, emoji: g.emoji, image: g.image, points: g.points })),
  });
});

// 提交兑换申请（此时不扣分，审核通过才扣）
app.post('/api/kid/:id/redeem', (req, res) => {
  const kid = findKid(req.params.id);
  if (!kid) return res.status(404).json({ error: '账号不存在' });
  const gift = findGift((req.body || {}).giftId);
  if (!gift || !gift.onShelf) return res.status(400).json({ error: '礼品不存在或已下架' });
  if (kid.points < gift.points) {
    return res.status(400).json({ error: `积分不够！需要 ${gift.points} 分，${kid.name}只有 ${kid.points} 分` });
  }
  const r = {
    id: nextId(), kidId: kid.id, kidName: kid.name,
    giftId: gift.id, giftName: gift.name, giftImage: gift.image || '', giftEmoji: gift.emoji || '🎁', giftPoints: gift.points,
    status: 'pending', createdAt: Date.now(), reviewedAt: null,
  };
  db.requests.unshift(r);
  saveDb();
  res.json({ ok: true, request: r });
});

// 我的记录
app.get('/api/kid/:id/records', (req, res) => {
  const kid = findKid(req.params.id);
  if (!kid) return res.status(404).json({ error: '老师没有找到你的账号，请退出后重新登录哦' });
  res.json({
    kid: { id: kid.id, name: kid.name, avatar: kid.avatar, points: kid.points },
    history: db.history.filter(h => h.kidId === kid.id),
    requests: db.requests.filter(r => r.kidId === kid.id),
  });
});

/* ---------- 管理端：概览 ---------- */
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  res.json({
    pending: db.requests.filter(r => r.status === 'pending').length,
    gifts: db.gifts.length,
    kids: db.kids.length,
  });
});

/* ---------- 管理端：礼品管理 ---------- */
app.get('/api/admin/gifts', requireAdmin, (req, res) => res.json(db.gifts));

app.post('/api/admin/gifts', requireAdmin, (req, res) => {
  const { name, points, emoji, image, onShelf } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '老师，礼品名称还没有填哦' });
  const p = Number(points);
  if (!Number.isInteger(p) || p <= 0) return res.status(400).json({ error: '积分必须是正整数哦' });
  const g = {
    id: nextId(), name: String(name).trim(), points: p,
    emoji: emoji || '🎁', image: image || '', onShelf: onShelf !== false, createdAt: Date.now(),
  };
  db.gifts.unshift(g);
  saveDb();
  res.json(g);
});

app.put('/api/admin/gifts/:id', requireAdmin, (req, res) => {
  const g = findGift(req.params.id);
  if (!g) return res.status(404).json({ error: '老师，该礼品不存在或已被删除' });
  const { name, points, emoji, image, onShelf } = req.body || {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: '请填写礼品名称' });
    g.name = String(name).trim();
  }
  if (points !== undefined) {
    const p = Number(points);
    if (!Number.isInteger(p) || p <= 0) return res.status(400).json({ error: '积分必须是正整数哦' });
    g.points = p;
  }
  if (emoji !== undefined) g.emoji = emoji || g.emoji;
  if (image !== undefined) g.image = image;
  if (onShelf !== undefined) g.onShelf = !!onShelf;
  saveDb();
  res.json(g);
});

app.delete('/api/admin/gifts/:id', requireAdmin, (req, res) => {
  const i = db.gifts.findIndex(g => g.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: '老师，该礼品不存在或已被删除' });
  db.gifts.splice(i, 1);
  saveDb();
  res.json({ ok: true });
});

/* ---------- 管理端：小朋友账号 ---------- */
app.get('/api/admin/kids', requireAdmin, (req, res) => res.json(db.kids));

app.post('/api/admin/kids', requireAdmin, (req, res) => {
  const { name, avatar } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '老师，请先填写小朋友的昵称哦' });
  if (db.kids.some(k => k.name === String(name).trim())) return res.status(400).json({ error: '老师，这个昵称已经存在了，换一个吧' });
  const k = {
    id: nextId(), name: String(name).trim(),
    avatar: avatar || AVATARS[db.kids.length % AVATARS.length],
    points: 0, createdAt: Date.now(),
  };
  db.kids.push(k);
  saveDb();
  res.json(k);
});

app.delete('/api/admin/kids/:id', requireAdmin, (req, res) => {
  const i = db.kids.findIndex(k => k.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: '老师，该账号不存在或已被删除' });
  db.kids.splice(i, 1);
  saveDb();
  res.json({ ok: true });
});

// 手动加/扣积分
app.post('/api/admin/kids/:id/points', requireAdmin, (req, res) => {
  const k = findKid(req.params.id);
  if (!k) return res.status(404).json({ error: '老师，该账号不存在或已被删除' });
  const delta = Number((req.body || {}).delta);
  const reason = String((req.body || {}).reason || '').trim();
  if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: '老师，请输入正确的调整分值（非 0 整数）' });
  if (k.points + delta < 0) {
    return res.status(400).json({ error: `老师，操作失败：${k.name}当前只有 ${k.points} 分，最多扣 ${k.points} 分` });
  }
  k.points += delta;
  addHistory(k, delta, reason || '管理员手动调整');
  saveDb();
  res.json(k);
});

/* ---------- 管理端：兑换申请审核 ---------- */
app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const { status } = req.query;
  let list = db.requests;
  if (status && status !== 'all') list = list.filter(r => r.status === status);
  res.json(list);
});

app.post('/api/admin/requests/:id/approve', requireAdmin, (req, res) => {
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r || r.status !== 'pending') return res.status(400).json({ error: '老师，这条申请已经处理过了哦' });
  const kid = findKid(r.kidId);
  if (!kid) return res.status(400).json({ error: '老师，该小朋友账号已被删除，无法通过' });
  const gift = findGift(r.giftId);
  const cost = gift ? gift.points : r.giftPoints;
  if (kid.points < cost) {
    return res.status(400).json({ error: `老师，${kid.name}当前只有 ${kid.points} 分，兑换「${r.giftName}」需 ${cost} 分，无法通过` });
  }
  kid.points -= cost;
  r.status = 'approved';
  r.reviewedAt = Date.now();
  addHistory(kid, -cost, `兑换礼品「${r.giftName}」`);
  saveDb();
  res.json(r);
});

app.post('/api/admin/requests/:id/reject', requireAdmin, (req, res) => {
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r || r.status !== 'pending') return res.status(400).json({ error: '老师，这条申请已经处理过了哦' });
  r.status = 'rejected';
  r.reviewedAt = Date.now();
  saveDb();
  res.json(r);
});

/* ---------------- 启动 ---------------- */
// 立即开始加载数据；导出 app 和 dbReadyPromise 给本地 / 云函数使用
const dbReadyPromise = loadDb();

module.exports = { app, dbReadyPromise };