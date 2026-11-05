# NETVERSE 3D — Quán net online

Game trình duyệt 3D với 500 máy tính, góc nhìn sau avatar, cộng đồng online, PC giả lập và phòng tranh. Nội dung yêu cầu nằm ở [update.md](update.md), [update2.md](update2.md) và [kế hoạch triển khai](docs/UPDATE_PLAN.md).

## Chạy bằng Docker local

```bash
cp .env.example .env
# Đổi POSTGRES_PASSWORD và ADMIN_PASSWORD trong .env trước khi chạy.
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose --env-file .env up -d --force-recreate gateway
```

Mở **http://127.0.0.1:18473/** để tạo tài khoản người chơi; trang admin ở **http://127.0.0.1:18473/admin**. Admin dùng thông tin `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`. Cần đặt cả `TURNSTILE_SITEKEY` và `TURNSTILE_SECRET_KEY` cùng một cặp; `.env.example` chứa cặp **test key** cho local. Trước khi triển khai public phải dùng cặp key thật và HTTPS. Thêm `GEMINI_API_KEY` nếu cần gợi ý bố trí bằng AI. Để tìm video YouTube theo từ khóa trong PC, tạo khóa YouTube Data API v3 và đặt `YOUTUBE_API_KEY` trong `.env` của máy chạy API, rồi khởi động lại API. Không đặt khóa trong mã web. Nếu chưa có khóa, người chơi vẫn mở được video bằng URL. Tài khoản admin local hiện tại nằm trong `.env` bị Git bỏ qua.

Kiểm tra các dịch vụ:

```bash
curl -fsS http://127.0.0.1:18473/health
curl -fsS http://127.0.0.1:18473/api/ready
curl -fsS http://127.0.0.1:18473/socket/ready
curl -fsS http://127.0.0.1:18473/voice/ready
npm run lint && npm run typecheck && npm test && npm run build
```

`docker compose --env-file .env down` dừng stack nhưng giữ dữ liệu người chơi và ảnh trong Docker volumes. Muốn chạy không dùng Docker, cần PostgreSQL và Redis theo `compose.yaml`, chạy `npm run dev:api`, `npm run dev:game`, `npm run dev:voice`, `npm run dev` ở bốn terminal và đặt reverse proxy `/api`, `/socket`, `/voice` tương tự `infra/nginx/netverse.conf`.

## Cách chơi

- Tạo username/mật khẩu, fullname và nickname duy nhất. Mỗi tài khoản mới có 60 phút. Nút **Lưu game** lưu vị trí; profile có thể tải ảnh avatar.
- Camera theo vị trí nhân vật. W đi vào quán, S lùi, A sang trái, D sang phải; nhân vật quay về hướng đang đi. Shift chạy, E ngồi/đứng. Trên điện thoại, các tab nằm ở thanh nav dưới cùng; kéo cần điều khiển để đi, giữ nút CHẠY để chạy và chạm nút **Ngồi vào máy** khi đến gần ghế. Menu trên cùng có lưu game, Profile và đăng xuất. Profile cho xem trước 10 nhân vật 3D rồi mới lưu lựa chọn. Mỗi ghế có số máy. Thời gian chỉ trừ khi ngồi. Hết giờ, avatar ra sân ngoài; có thể quỳ xin và nhận phút từ người khác qua tab Cộng đồng. Bảng tên hiện phút còn lại, tổng thời gian online và huy hiệu nghệ sĩ.
- PC có desktop với hình nền vẽ/tải lên, trình duyệt, album ảnh và top 10 tranh. Ảnh tải lên được nén; hình nền mới và tranh vẽ tự động vào album của PC. Thông báo tải ảnh hiện ngay trong desktop. Hình nền, URL browser và album ở lại máy cho người đến sau. Mỗi like cộng 10 phút cho tác giả. Ảnh bị xóa khi unlike vượt quá nửa số người dùng máy từ lúc đăng, tối thiểu 5 người.
- Trong Album hoặc Top tranh, bấm vào ảnh để xem lớn; bấm nút ×, phím Esc hoặc nền ngoài popup để quay lại. Bấm tên/avatar tác giả để xem profile và mở chat riêng nếu họ đang online.
- Biểu tượng YouTube mở trang tìm kiếm theo tên bài hát hoặc từ khóa, chọn kết quả để xem bằng trình phát ngay trong tab PC. TikTok mở trang dán link video. Shortcut khác được tải trong khung PC nếu trang đích cho phép iframe.
- Trình duyệt PC dùng khung 16:9 trên desktop và mở rộng theo chiều cao màn hình điện thoại. Khi kết nối game bị ngắt hoặc server khởi động lại, game tự kết nối lại; vị trí nhân vật được lưu khi phiên cũ đóng bình thường. Bản xem trước PC trong admin cũng dùng khung 16:9 và theo dõi trang hiện mở.
- Tab Cộng đồng hiển thị người online, các cuộc trò chuyện riêng theo tin nhắn mới nhất, số tin chưa đọc, avatar, thời gian nhắn và tim. Tin mình gửi ở bên phải; tin người khác ở bên trái, cỡ chữ lớn hơn. Ảnh chat được nén trước khi gửi. Chat không lưu trên server; nội dung nhận được lưu trong IndexedDB của máy người chơi. Người offline không nhận tin nhắn. Giao diện dùng font Be Vietnam Pro.
- Admin tải GLB/GLTF, nhập giấy phép, xem trước/cân kích thước, kéo vật thể trên sơ đồ và xuất bản. Gemini có thể tạo phương án bố trí để admin duyệt. Admin cũng chỉnh ngưỡng cấp nghệ sĩ và màu/ảnh nền bảng vàng.
- Admin có menu riêng cho người chơi, phòng máy, nhạc, ảnh, xây thế giới và cài đặt. Mục **Nhạc cộng đồng** lưu URL âm thanh HTTPS trực tiếp (MP3/OGG hoặc luồng radio tương thích trình duyệt) hay MP3 tải lên; mỗi bài cũng có thể lưu link YouTube và Spotify để tham khảo. Admin chọn bài có nguồn âm thanh bằng nút **PHÁT** hoặc dừng nhạc chung. Checkbox nhạc trên header mặc định bật cho người mới; người dùng có thể tắt và chỉnh âm lượng. Nhạc phát nền, không có video. Link trang Spotify/YouTube không thể dùng làm URL âm thanh ẩn ([quy định YouTube](https://developers.google.com/youtube/terms/developer-policies), [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/reference)); bài YouTube cũ cần được admin thay bằng URL âm thanh trực tiếp. Trình duyệt có thể yêu cầu bấm **Phát nhạc** lần đầu. Admin có danh sách người chơi, trạng thái 500 PC và bản xem trước desktop đang hoạt động.
- Voice chat có hai nút **Nghe** và **Mic** trên desktop/mobile. Bấm Nghe để vào kênh âm thanh gần nhân vật (bán kính 12, tối đa 6 người); người xa nghe nhỏ hơn. Mic chỉ xin quyền khi bấm bật và có thể tắt riêng. Voice sử dụng WebRTC P2P; cần HTTPS và quyền micro. Mạng không hỗ trợ kết nối trực tiếp có thể cần TURN; xem [kế hoạch dịch vụ](docs/SERVICE_ARCHITECTURE.md).

Xem thêm [kiến trúc và giới hạn](docs/ARCHITECTURE.md), [giấy phép asset](docs/ASSET_LICENSES.md), [cách thêm GLB](docs/ASSET_INTEGRATION.md), và [guide gốc](NETVERSE_3D_ASSET_GUIDE.md).

[Hướng dẫn chơi có ảnh minh họa](tutorial.md) · [Kế hoạch tách dịch vụ](docs/SERVICE_ARCHITECTURE.md).

Triển khai bằng Jenkins: xem [hướng dẫn tạo agent và cấu hình CI/CD](docs/JENKINS.md).
