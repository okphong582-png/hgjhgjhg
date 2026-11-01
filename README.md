# Mizze Connect

Web tiếng Việt/English, thêm cấu hình Happ bằng key hiện có, phím tắt riêng từng key và thời gian tự tắt từng chức năng.

## Vercel

Import repo này; build `npm run build`, output `dist`. API function chỉ chuyển tiếp các route công khai được cho phép tới gateway. Đặt biến server `MIZZE_GATEWAY_ORIGIN` và `MIZZE_WEB_PROXY_TOKEN` trong Vercel rồi redeploy. Giá trị lấy từ bộ VPS riêng; không commit vào Git.

## Gateway

Xray và relay TCP/UDP chạy riêng trên Windows VPS; Vercel chỉ phục vụ web/API. Source trong repo không chứa runtime native, khóa Firebase, dữ liệu khách hay token. Bộ VPS riêng đã kèm thư viện và runtime. Xem HUONG_DAN_VPS.txt.

## Kiểm tra

`npm ci` rồi `npm test`; kiểm tra gateway native cần bộ VPS riêng và các port thử chưa dùng.

Chức năng áp dụng bộ lọc lưu lượng UDP; chưa chứng minh hiệu ứng cụ thể trong game. Đây không phải cơ chế nhận thao tác bắn từ iPhone.
