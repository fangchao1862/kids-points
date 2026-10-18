'use strict';
// CloudBase Web 函数入口（listen 9000 模式，匹配 WEB_SCF 路由）
// - scf_bootstrap 启动 node 加载本文件
// - 立即 listen，平台网关转发流量到该端口
// - 数据库初始化放后台，不阻塞 listen
const { app, dbReadyPromise } = require('./app');

const PORT = process.env.PORT || 9000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[kids-points] listening on port ${PORT}`);
});

server.on('error', (err) => console.error('[kids-points] listen error:', err));

dbReadyPromise
  .then(() => console.log('[kids-points] 数据库初始化完成'))
  .catch((err) => console.error('[kids-points] 数据库初始化失败:', err.message));