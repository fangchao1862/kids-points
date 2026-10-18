# 部署到 Zeabur（免费，中文界面，不用国际信用卡）

Zeabur 从 GitHub 仓库直接构建 Dockerfile 部署，代码已适配它的数据库环境变量，遇到问题看第 5 节。

---

## 1. 登录并建项目

1. 打开 https://zeabur.com → 用 **GitHub 账号登录**（Sign in with GitHub，授权即可）
2. 点 **Create Project**（创建项目）
3. 地区建议选：**Hong Kong（香港）** 或 **Tokyo（东京）**，国内访问更快

## 2. 部署 Web 服务

1. 项目里点 **Add Service → Git**（从 GitHub 部署）
2. 首次会要求授权 GitHub → 勾选仓库 `fangchao1862/kids-points`
3. 选中该仓库，Zeabur 会**自动检测到 Dockerfile** → 直接点 **Deploy**
4. 稍等 2～4 分钟构建完成，状态变绿，会得到一个默认域名，形如：
   ```
   https://kids-points.zeabur.app
   ```

## 3. 建数据库

1. 同一个项目里再点 **Add Service → Database → PostgreSQL**
2. 默认配置即可 → 创建
3. 建好后点进 PostgreSQL 服务 → 左侧 **Variables**（环境变量）
4. 找到 **`POSTGRES_CONNECTION_STRING`**，点旁边的复制按钮，复制整串连接字符串

## 4. 把数据库连到 Web 服务

1. 回到 Web 服务 `kids-points` → **Variables** 标签
2. 新增环境变量：
   - **Name**：`DATABASE_URL`
   - **Value**：粘贴刚才复制的连接字符串
3. 再顺手加一个：
   - **Name**：`TZ`　**Value**：`Asia/Shanghai`
4. 保存后点 **Redeploy**（重新部署）

> 代码已兼容 Zeabur 的 `POSTGRES_CONNECTION_STRING`、`POSTGRES_HOST` 等写法，所以变量名用哪个都能自动识别。

## 5. 验证（关键）

浏览器打开：

```
https://你的域名.zeabur.app/api/health
```

期望返回：

```json
{"ok":true,"storage":"postgres","dbConnected":true,"kids":3}
```

- `storage: "postgres"` + `dbConnected: true` + `kids: 3` → 完美，vini / fangchao / Vivi 和 10 件礼品已自动恢复
- `storage: "local-file"` → 数据库没连上，检查第 4 步环境变量是否填对、有没有 Redeploy
- 打不开 → 看服务 **Logs** 标签里的报错，截图发我

---

## 常见问题

**Q：创建 PostgreSQL 提示要付费 / 试用期？**

Zeabur 免费额度有限，数据库可能算付费资源。解决办法：用免费的外部数据库 ——

1. 打开 https://neon.tech → GitHub 登录 → 免费创建 Postgres（免费额度足够家用）
2. 复制它的连接串（类似 `postgres://user:pass@ep-xxx.neon.tech/neondb`）
3. 填到 Zeabur Web 服务的 `DATABASE_URL` 环境变量里 → Redeploy

**Q：手机 / iPad 访问慢？**

换项目地区为 **Hong Kong**。Zeabur 的免费域名 `*.zeabur.app` 在国内部分地区可能不稳，稳定后可在服务设置里绑定自己的域名。

**Q：数据会丢吗？**

不会。数据全在 PostgreSQL 里，重启、重新部署都不丢。只有第一次（库为空）会从 `seed-data.json` 导入历史数据。

## 以后更新线上数据

```
node scripts/export-seed.js     # 导出本地最新数据
git add . && git commit -m "更新数据" && git push
```

Zeabur 检测到 push 会自动重新部署（已默认开启自动部署）。

---

## 安全提醒

上線后立刻打开 `https://你的域名/admin`，用 `admin123` 登录并**马上修改密码**。
