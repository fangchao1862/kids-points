# 部署到 Render（免费，5 分钟搞定）

Render 免费版自带 **PostgreSQL 数据库**，孩子的积分数据存在数据库里，**容器重启 / 重新部署都不会丢**。

---

## 方式 A：Blueprint 一键部署（推荐，最省事）

1. 打开 https://render.com/ ，用 **GitHub 账号登录**（没有就注册，免费）

2. 把本项目代码传到 GitHub（二选一）：
   - **有 Git**：项目根目录执行
     ```
     git init
     git add .
     git commit -m "儿童积分系统"
     ```
     然后去 https://github.com/new 建一个 **Private** 仓库，按提示 push
   - **不想用 Git**：直接用方式 B

3. 打开 https://dashboard.render.com/blueprints ，点 **New Blueprint Instance**

4. 连接你刚建的 GitHub 仓库 → Render 会自动读到根目录的 `render.yaml`

5. 点 **Apply** → Render 自动创建两样东西：
   - Web Service `kids-points`（Docker，跑本项目）
   - PostgreSQL `kids-points-db`（免费 1GB）
   - 并把数据库连接串自动注入到 Web Service 的 `DATABASE_URL`

6. 等 3～5 分钟构建完成，状态变绿 **Live**

7. 拿到地址（形如 `https://kids-points-xxxx.onrender.com`），打开即可使用

---

## 方式 B：手动创建（不用 GitHub / 不用 Git）

1. 登录 https://render.com/ → **New +** → **Web Service**

2. 选 **Deploy an existing image from a registry** 或连接仓库都行；
   若用仓库：Repository 选本项目，`Runtime` 选 **Docker**

3. 关键设置：
   - **Name**：`kids-points`
   - **Region**：`Singapore`（离国内最近，延迟最低）
   - **Instance Type**：**Free**
   - **Health Check Path**：`/api/health`

4. 再单建数据库：**New +** → **PostgreSQL**
   - Name：`kids-points-db`
   - Region：`Singapore`
   - Plan：**Free**
   - 建好后，在数据库详情页复制 **Internal Database URL**

5. 回到 Web Service → **Environment** → 添加环境变量：
   - `DATABASE_URL` = 上一步复制的 Internal Database URL
   - `TZ` = `Asia/Shanghai`

6. 点 **Manual Deploy** → **Deploy latest commit**

---

## 部署后必做的验证（30 秒）

把 `https://你的地址.onrender.com` 替换下面的地址执行：

```
https://你的地址.onrender.com/api/health
```

**期望返回**（关键是 `storage` 和 `dbConnected`）：

```json
{ "ok": true, "storage": "postgres", "dbConnected": true, "kids": 1 }
```

- ✅ `storage: "postgres"` + `dbConnected: true` → 数据存在数据库，**重启不丢**，完美
- ⚠️ `storage: "local-file"` → `DATABASE_URL` 没生效，数据会在重新部署时丢失，回去检查环境变量

---

## ⚠️ 两个必须知道的点

### 1. 免费版 15 分钟没人访问会「休眠」
第一次打开要等 **30～50 秒** 唤醒，之后就快了。

**解决办法**（保活，免费）：
- 注册 https://uptimerobot.com （免费）
- 添加监控：`https://你的地址.onrender.com/api/health`，间隔设 **5 分钟**
- 它每 5 分钟 ping 一次，实例就不会休眠，孩子随时打开都是秒开

如果不想折腾，升级 Render **Starter 计划**（$7/月）可永不休眠。

### 2. 立刻改默认密码
打开 `https://你的地址.onrender.com/admin`，默认密码 `admin123`，进去后**马上改掉**。

---

## 数据安全保障

| 场景 | 数据是否安全 |
|------|------------|
| 日常使用 | ✅ 每次改动写入 PostgreSQL |
| Render 重启 / 重新部署 | ✅ 数据在数据库里，不丢 |
| 免费实例休眠唤醒 | ✅ 不丢 |
| 只有 `local-file` 模式 | ⚠️ 重新部署会丢，别用这种状态长期使用 |

---

## 本地开发 / 应急使用

不开数据库也能跑（数据存本地 `data/data.json`）：

```
npm install
node server.js
```

打开 http://localhost:3000 ，局域网内手机 / iPad 可用 `http://你的内网IP:3000` 访问。
