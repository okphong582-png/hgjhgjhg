# Mizze Connect

Trang web tại https://mizzedongnhathoangha.com/ dùng key Mizze để cấp hồ sơ Happ theo từng tài khoản. Sau khi cấp hồ sơ, mục Chức năng hiển thị trạng thái AimLag do gateway trả về. AimLag suy luận từ lưu lượng mạng và chưa xác nhận hiệu ứng trong game.

## Vercel

Build `npm run build`, output `dist`. Đặt hai biến môi trường Production:

- `MIZZE_GATEWAY_ORIGIN`: tên miền HTTPS riêng của Cloudflare Tunnel tới gateway VPS.
- `MIZZE_WEB_PROXY_TOKEN`: token dùng chung với gateway trong `private/web-proxy-secret.json`, giữ trên server.

Tên miền Vercel là địa chỉ web. Gateway phải trỏ về VPS ở cổng web 8788. API Vercel giới hạn số lượt gọi theo IP và số yêu cầu đồng thời trên từng instance. Vercel cung cấp thêm lớp giảm thiểu DDoS.

## VPS

Dùng bộ VPS có hệ thống key và giữ nguyên thư mục `private`, thư viện và runtime. Xem [hướng dẫn VPS](HUONG_DAN_VPS.txt). Phiên Happ, thông tin Firebase và token là dữ liệu riêng của máy chủ.

Gateway gửi header `Hide-Settings: 1` khi Happ tải hồ sơ. Hồ sơ đã thêm cần cập nhật trong Happ để nhận cài đặt. Tùy chọn này ẩn phần xem và sửa cấu hình máy chủ trong Happ.

## Kiểm tra

Chạy `npm ci`, `npm test` và `npm run build`. Đặt `MIZZE_TEST_PYTHON` và `MIZZE_TEST_BACKUP_ROOT` để chạy kiểm thử tích hợp key, cấp hồ sơ và AimLag bằng gateway mô phỏng.
