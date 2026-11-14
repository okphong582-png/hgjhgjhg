'use strict';
// Cấu hình gắn thẳng trong code — Vercel KHÔNG cần biến môi trường.
// Chỉ chứa thông tin công khai. Không đặt khóa riêng hay mật khẩu vào file này (repo công khai).
module.exports = {
  // Địa chỉ HTTPS cố định của gateway trên VPS (Cloudflare Tunnel có tên trỏ về localhost:PORT).
  VPS_ORIGIN: 'https://gateway.mizzeproxy.store',
  // Tên hồ sơ hiển thị trong Happ.
  PROFILE_NAME: 'Mizze',
  // Cổng web nội bộ trên VPS (tunnel trỏ về đây).
  PORT: 8788,
  // Cổng nội bộ của Xray WebSocket.
  WS_PORT: 18465
};
