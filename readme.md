# NETVERSE 3D — Quán net online

Game trình duyệt 3D với 200 máy tính, góc nhìn sau avatar, cộng đồng online, PC giả lập và phòng tranh. Nội dung yêu cầu nằm ở [update.md](update.md), [update2.md](update2.md) và [kế hoạch triển khai](docs/UPDATE_PLAN.md).

## Chạy bằng Docker local

```bash
cp .env.example .env
# Đổi POSTGRES_PASSWORD và ADMIN_PASSWORD trong .env trước khi chạy.
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose --env-file .env up -d --force-recreate gateway
```

Mở **http://127.0.0.1:18473/** để tạo tài khoản người chơi; trang admin ở **http://127.0.0.1:18473/admin**. Admin dùng thông tin `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`. `.env.example` chứa cặp Turnstile **test key** chính thức cho local; trước khi triển khai public phải dùng key thật và HTTPS. Thêm `GEMINI_API_KEY` nếu cần gợi ý bố trí bằng AI. Tài khoản admin local hiện tại nằm trong `.env` bị Git bỏ qua.

Kiểm tra các dịch vụ:

```bash
curl -fsS http://127.0.0.1:18473/health
curl -fsS http://127.0.0.1:18473/api/ready
curl -fsS http://127.0.0.1:18473/socket/ready
npm run lint && npm run typecheck && npm test && npm run build
```

`docker compose --env-file .env down` dừng stack nhưng giữ dữ liệu người chơi và ảnh trong Docker volumes. Muốn chạy không dùng Docker, cần PostgreSQL và Redis theo `compose.yaml`, rồi chạy `npm run dev:api`, `npm run dev:game`, `npm run dev` ở ba terminal.

## Cách chơi

- Tạo username/mật khẩu, fullname và nickname duy nhất. Mỗi tài khoản mới có 60 phút. Nút **Lưu game** lưu vị trí; profile có thể tải ảnh avatar.
- Nhấp vào cảnh 3D để giữ chuột và xoay camera; Esc thả chuột. WASD đi theo hướng camera, Shift chạy, E ngồi/đứng. Camera lùi xa hơn và nhân vật xoay mượt theo hướng di chuyển. Mỗi ghế có số máy. Thời gian chỉ trừ khi ngồi. Hết giờ, avatar ra sân ngoài; có thể quỳ xin và nhận phút từ người khác qua tab Cộng đồng. Bảng tên hiện phút còn lại, tổng thời gian online và huy hiệu nghệ sĩ.
- PC có desktop với hình nền vẽ/tải lên, trình duyệt, album ảnh và top 10 tranh. Ảnh tải lên được nén; hình nền mới và tranh vẽ tự động vào album của PC. Thông báo tải ảnh hiện ngay trong desktop. Hình nền, URL browser và album ở lại máy cho người đến sau. Mỗi like cộng 10 phút cho tác giả. Ảnh bị xóa khi unlike vượt quá nửa số người dùng máy từ lúc đăng, tối thiểu 5 người.
- Dán URL video YouTube hoặc TikTok vào trình duyệt PC để phát bằng player nhúng. Báo điện tử chỉ hiển thị nếu trang cho phép iframe; nút **Mở ngoài** mở trang trong tab trình duyệt mới khi bị chặn.
- Tab Cộng đồng hiển thị người online, chat phòng chung/riêng và ảnh. Chat không lưu trên server; nội dung nhận được lưu trong IndexedDB của máy người chơi. Người offline không nhận tin nhắn.
- Admin tải GLB/GLTF, nhập giấy phép, xem trước/cân kích thước, kéo vật thể trên sơ đồ và xuất bản. Gemini có thể tạo phương án bố trí để admin duyệt. Admin cũng chỉnh ngưỡng cấp nghệ sĩ và màu/ảnh nền bảng vàng.

Xem thêm [kiến trúc và giới hạn](docs/ARCHITECTURE.md), [giấy phép asset](docs/ASSET_LICENSES.md), [cách thêm GLB](docs/ASSET_INTEGRATION.md), và [guide gốc](NETVERSE_3D_ASSET_GUIDE.md).
