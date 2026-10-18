# 部署到 Koyeb（真免费，不需要信用卡，自带 PostgreSQL）

Koyeb 免费套餐包含一个 512MB 的 Web 服务 **和** 一个免费托管 PostgreSQL，**GitHub 登录即可，全程不用绑卡**。

---

## 1. 注册

打开 👉 **https://app.koyeb.com** → 点 **Sign up with GitHub** → 授权。

> 不要选邮箱注册，用 GitHub 登录最省事（后面要连仓库）。

## 2. 先建数据库

1. 登录后点右上角 **Create → Database**（或左侧 Databases）
2. 类型选 **PostgreSQL**（Koyeb 的托管 Postgres，由 Neon 提供）
3. **Plan** 一定选 **Free**（免费）
4. 名字填 `kids-points-db`，区域选 **Frankfurt（法兰克福）** 或 **Washington DC**
5. 点 **Create Database**，等状态变 **Healthy**

## 3. 部署 Web 服务

1. 点 **Create → Web Service**
2. **Deployment method** 选 **GitHub** → 找到 `fangchao1862/kids-points` 仓库
3. **Builder**：确认是 **Dockerfile**（会自动识别，无需改动）
4. **Region**：选跟数据库同一个区域（法兰克福）
5. **Instance type**：选 **Free**（Nano）
6. **Environment variables** 添加两项：
   - `DATABASE_URL` → 点旁边的 **Add from database**，选刚才的 `kids-points-db`（自动填 KR/gpu 内部地址）
     - 若没有这个按钮：去数据库详情页复制连接串，手动粘贴进来
   - `TZ` = `Asia/Shanghai`
7. 展开 **Health checks**：路径填 `/api/health`
8. 点 **Deploy**，等 3～5 分钟，状态变 **Healthy**

会得到域名，形如：

```
https://kids-points-fangchao1862-xxxx.koyeb.app
```

## 4. 验证（关键）

浏览器打开：

```
https://你的域名.koyeb.app/api/health
```

期望返回：

```json
{"ok":true,"storage":"postgres","dbConnected":true,"kids":3}
```

- `postgres` + `dbConnected: true` + `kids: 3` → 成功！vini / fangchao / Vivi 和 10 件礼品自动回来了
- `local-file` → 数据库没连上，检查 `DATABASE_URL` 是否填对，然后 **Redeploy**
- 打不开 → 打开服务的 **Runtime logs** 看红字，截图发我

---

## 说明与注意事项

**免费实例休眠**：闲置约 1 小时会缩到 0，下次访问冷启动 10～30 秒。
想秒开：注册 https://uptimerobot.com 免费账号，加一个 5 分钟间隔的监控 ping `/api/health`。

**数据安全**：所有数据存在 PostgreSQL 里，重启、重新部署、休眠都不丢。只有首次（库为空）会从 `seed-data.json` 自动导入历史数据。

**以后更新线上数据**：

```
node scripts/export-seed.js
git add . && git commit -m "更新数据" && git push
```

Koyeb 检测到 push 会自动重新部署。

**上线后立刻做**：打开 `https://你的域名/admin`，用 `admin123` 登录，**马上改密码**。
