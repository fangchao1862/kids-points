# 儿童积分换礼物系统 —— 云主机容器镜像（Render / Railway / 任意 Docker 主机）
# 用 Debian slim 而非 alpine：自带时区数据，避免额外联网安装，构建更稳
FROM node:20-slim

# 时区设为上海：孩子端「今日积分」等按本地时间统计
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production
WORKDIR /app

# 先复制依赖清单并安装，充分利用 Docker 构建缓存
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# 再复制源码
COPY server.js ./
COPY public ./public
COPY functions ./functions

# 数据与上传目录（配了 PostgreSQL 时数据落库，这里仅作兜底）
RUN mkdir -p /app/data /app/uploads

# Render 会自动注入 PORT，这里只是本地默认
EXPOSE 3000

# 健康检查：Render 依赖它判断实例是否真正就绪
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;require('http').get('http://127.0.0.1:'+p+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]