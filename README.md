# Mizze Connect — bản sạch

Web gọn để thêm cấu hình Happ, cùng máy chủ VPS (Xray VLESS/WebSocket → relay SOCKS5 → Internet).
Bản này chỉ chuyển tiếp dữ liệu: không đọc, giữ, sửa hay chèn gói tin game, không có key/giấy phép.

## Cấu hình gắn sẵn (không cần biến môi trường Vercel)

Mọi thứ nằm trong `mizze.config.cjs`:

| Mục | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `VPS_ORIGIN` | `https://gateway.mizzeproxy.store` | Địa chỉ HTTPS cố định của VPS (Cloudflare Tunnel có tên) |
| `PROFILE_NAME` | `Mizze` | Tên hồ sơ trong Happ |
| `PORT` | `8788` | Cổng web nội bộ trên VPS; tunnel trỏ về `http://localhost:8788` |
| `WS_PORT` | `18465` | Cổng nội bộ của Xray |

File này nằm trong repo công khai nên chỉ chứa thông tin công khai. Phiên kết nối (UUID, token) và mật khẩu relay
tự sinh lần đầu chạy trong `private/` trên VPS và không bao giờ lên GitHub.

## Vercel

Import repo, giữ nguyên `vercel.json` (build `node build.cjs`, output `dist`). Không cần thêm biến môi trường.
Hàm `api/gateway.js` chuyển tiếp `/api/state`, `/api/config`, `/sub/…` tới `VPS_ORIGIN`.

## VPS Windows

1. Giải nén bộ VPS vào một thư mục mới. Bộ đã kèm `native/xray.exe`.
2. Cần Node.js 20+ (hoặc đặt `node.exe` vào `native/node/`).
3. Dừng gateway cũ đang dùng cổng 8788 nếu có (DUNG_VPS.bat của bộ cũ).
4. Bấm `CHAY_VPS.bat`, chờ dòng `Mizze sẵn sàng`.
5. Cloudflare Tunnel `gateway.mizzeproxy.store` vẫn trỏ về `http://localhost:8788` như cũ.

Muốn đổi cổng/địa chỉ chỉ trên VPS: chép `config.example.json` thành `config.json` rồi sửa.
Không có tên miền: đặt `"quickTunnel": true` và kèm `native/cloudflared.exe` để lấy địa chỉ trycloudflare tạm
(địa chỉ đổi mỗi lần chạy, khi đó nên mở web trực tiếp từ địa chỉ đó thay vì Vercel).

Đổi phiên (link Happ mới): dừng máy chủ, xóa `private/session.json`, chạy lại.

## Kiểm tra

```sh
npm test
```
