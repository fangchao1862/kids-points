'use strict';
// 把现有本地数据导出为「种子文件」seed-data.json
// 用途：部署到 Render 等云主机时，容器里没有历史数据，
//       应用首次启动会自动把本文件的数据（含礼品图片）导入 PostgreSQL。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'data.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

if (!fs.existsSync(DATA_FILE)) {
  console.error('找不到 data/data.json，无法导出');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 把本地 uploads/ 里的礼品图片一起打包（base64）
const images = {};
const mimeOf = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
for (const g of db.gifts) {
  const img = String(g.image || '');
  const name = img.startsWith('/uploads/') ? path.basename(img) : '';
  if (!name) continue;
  const p = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(p)) { console.warn(`  跳过缺失图片: ${name}`); continue; }
  images[name] = {
    mime: mimeOf[path.extname(name).toLowerCase()] || 'image/jpeg',
    data: fs.readFileSync(p).toString('base64'),
  };
}

const seed = { version: 1, exportedAt: Date.now(), data: db, images };
const out = path.join(ROOT, 'seed-data.json');
fs.writeFileSync(out, JSON.stringify(seed), 'utf8');

console.log('✅ 已导出种子数据 -> seed-data.json');
console.log(`   孩子 ${db.kids.length} 位：` + db.kids.map(k => `${k.name}(${k.points}分)`).join('、'));
console.log(`   礼品 ${db.gifts.length} 件：` + db.gifts.map(g => g.name).join('、'));
console.log(`   积分记录 ${db.history.length} 条，兑换申请 ${db.requests.length} 条`);
console.log(`   礼品图片 ${Object.keys(images).length} 张`);
console.log(`   文件大小 ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);