'use strict';
// 本地开发入口：监听端口启动服务
// 云函数部署入口：functions/index.js
// 业务逻辑：functions/app.js（被两边共用）
// 业务逻辑在 functions/kids-points/app.js（云函数代码目录下）
const { app } = require('./functions/kids-points/app');

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 儿童积分换礼物系统 已启动！');
    console.log(`   孩子端（扫码打开）: http://localhost:${PORT}/`);
    console.log(`   管理员后台:         http://localhost:${PORT}/admin   默认密码: admin123`);
    console.log('');
  });
}