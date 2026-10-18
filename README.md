# 儿童积分换礼物系统（H5）

仿自动售货机扫码选购的家庭积分系统：孩子扫码打开礼物货架，提交兑换申请；管理员后台录入礼品、创建账号、手动加减积分、审核申请（通过自动扣分）。

## 部署到公网（推荐 Render，免费且数据不丢）

完整步骤见 👉 **[DEPLOY-RENDER.md](DEPLOY-RENDER.md)**（约 5 分钟，含免费 PostgreSQL 数据库，积分数据永久保存）。

简单说：把本仓库推到 GitHub → 在 https://dashboard.render.com/blueprints 用 `render.yaml` 一键创建「Web 服务 + PostgreSQL」→ 拿到 `https://xxx.onrender.com` 就能用。

> 已适配云主机部署：检测到 `DATABASE_URL` 自动启用 PostgreSQL 持久化（否则降级为本地文件），支持 SSL / 明文自动嗅探。
> 原来的腾讯云 CloudBase 方案见 [DEPLOY.md](DEPLOY.md)（**注意：CloudBase 体验版不支持本应用所需能力，会部署失败**）。

## 运行

1. 安装 Node.js 16+（https://nodejs.org）
2. 双击 `start.bat`（或手动执行 `npm install` 后 `node server.js`）
3. 管理员后台：http://localhost:3000/admin（默认密码 `admin123`，登录后可修改）
4. 孩子端前台：http://localhost:3000/（首次进入选自己的头像即可，无需密码）

## 手机扫码访问（同一 WiFi 下）

1. 电脑启动服务后，登录管理后台 →「📱 访问二维码」
2. 页面默认显示电脑的局域网地址（如 `http://192.168.x.x:3000/`），点击「打印二维码」打印贴在家里
3. 手机连接同一 WiFi，扫码即打开礼物货架
4. 扫码打不开时：在 Windows 防火墙中允许 Node.js 访问网络，或放行 TCP 3000 端口

## 数据存储（重启不丢失）

- **本地运行**：`data/data.json`（礼品、账号、积分、申请）+ `uploads/`（礼品图片）
- **云端部署（腾讯云 CloudBase 云托管）**：数据自动存入云开发 NoSQL 数据库（集合 `kids_store_data`），礼品图片存入集合 `kids_store_images`，容器重启/重新部署数据均不丢失；`Dockerfile` 已就绪，通过环境变量 `TCB_MODE=1` + `TCB_ENV_ID=<环境ID>` 启用云存储

## 云端部署（CloudBase 云托管）

1. 已具备：`Dockerfile`（node:20-alpine）、云数据库双写数据层、图片上传前自动压缩（最长边 640px）
2. 部署：IDE 已连接 CloudBase 后，使用云托管部署本项目根目录（容器型，端口 3000，最小实例数 1）
3. 部署后：孩子端 `https://<服务域名>/`，管理员后台 `https://<服务域名>/admin`，公网任意用户可访问，无需同一 WiFi

## 主要逻辑

- 孩子提交兑换申请时校验积分是否足够，但**不立即扣分**
- 管理员点「同意」才扣分（会再次校验当前积分）；「驳回」不扣分
- 每次积分变动（手动加减 / 兑换扣除）都会写入孩子的积分历史
