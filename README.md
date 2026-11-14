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

Nút mở và sao chép Happ trên web dùng `happ://crypt5/…`. Vercel xác thực phiên ở gateway rồi gửi URL đăng ký có token phiên đến API mã hóa chính thức của Happ. Nếu mã hóa lỗi, web báo thử lại. Hồ sơ đã nhập bằng link thường cần thêm lại bằng link mới để ẩn URL đăng ký trong Happ.

Mỗi key cấp hồ sơ Happ từ một trình duyệt đã liên kết. Thiết bị Happ đầu tiên tải hồ sơ có HWID sẽ được ghi nhận trong phiên. Thiết bị khác hoặc ứng dụng không gửi HWID sẽ bị từ chối tải hồ sơ. Hồ sơ cũ cần cập nhật từ thiết bị chính trước khi kết nối lại. Đây là giới hạn cấp hồ sơ bằng HWID, không phải cơ chế xác thực phần cứng của kết nối VPN.

Khi tới thời hạn key, gateway đóng kết nối đang chạy và thu hồi phiên, thông tin xác thực Xray và quyền gọi API tính năng. Biểu tượng VPN của hệ điều hành có thể vẫn hiện trong lúc Happ thử kết nối lại.

## Kiểm tra

Chạy `npm ci`, `npm test` và `npm run build`. Đặt `MIZZE_TEST_PYTHON` và `MIZZE_TEST_BACKUP_ROOT` để chạy kiểm thử tích hợp key, cấp hồ sơ và AimLag bằng gateway mô phỏng.
