# CloudBase 部署指南

## 一键部署（Windows）

### 1. 获取环境 ID 和 API Key

在 CloudBase 控制台：

1. **环境 ID**：控制台首页 → 选中刚开通的环境 → 顶部「环境总览」页面顶部会显示 `envId`（形如 `kids-points-8g0xxxxxx`）
2. **API Key**：控制台 → 环境 → 安全配置 → 「新建 API 密钥」→ 勾选 `云托管` `数据库` 两个权限 → 复制密钥字符串

> API Key 是环境级别的，比腾讯云主账号密钥安全得多，权限被限定在当前环境。

### 2. 执行部署

在项目根目录打开 PowerShell / CMD，执行：

```cmd
set TCB_ENV_ID=kids-points-8g0xxxxxx
set CLOUDBASE_API_KEY=eyJhbGciOiJIUzI1NiJ9...
deploy.cmd
```

脚本会自动：
1. 用 API Key 登录 CloudBase
2. 上传项目源码到云端
3. 云端自动构建 Docker 镜像并部署云托管
4. 输出公网访问地址

## 手动部署（Web 控制台）

如果命令行方式遇到问题，可改用控制台手动操作：

1. 控制台 → 云托管 → 新建服务 → 服务名 `kids-points`
2. 部署方式选「容器部署」 → 端口 `3000`
3. 代码上传方式：
   - **方式 A**：上传本地项目压缩包（不含 node_modules、data、uploads、.codebuddy）
   - **方式 B**：使用 Git 仓库（需要先推送到 GitHub）
4. 配置环境变量（服务详情 → 环境变量）：
   - `TCB_MODE=1`
   - `TCB_ENV_ID=<你的环境ID>`
   - `PORT=3000`
5. 配置最小实例数 1，最大 5，CPU 1 核 / 内存 2 GB
6. 点击「发布」
7. 等待构建完成（约 2-3 分钟）

## 部署后必做

1. 访问 `https://<服务域名>/admin`，默认密码 `admin123` 登录
2. **立即修改密码**
3. **删除默认账号「小明」**，创建真实孩子账号
4. 创建 CloudBase 数据库集合（控制台 → 数据库）：
   - `kids_store_data`（业务数据）
   - `kids_store_images`（礼品图片）
   - 权限都设为「仅创建者及管理员可读写」
5. 测试扫码路径：在管理后台「📱 访问二维码」查看生成的公网 URL