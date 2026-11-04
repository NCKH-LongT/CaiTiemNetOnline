# Kiến trúc NETVERSE 3D

## Dịch vụ

| Dịch vụ | Trách nhiệm |
| --- | --- |
| Next.js + React Three Fiber | Bản đồ 200 máy, camera sau nhân vật, PC giả lập, cộng đồng, admin editor |
| Colyseus | Vị trí, ghế, thời gian chơi, chat online 1:1 và phòng chung |
| Node API | Tài khoản, hồ sơ, vị trí Save, trạng thái PC, ảnh, vote, phút tặng, bảng vàng, admin |
| PostgreSQL | Dữ liệu người chơi, PC, ảnh, vote, vật thể và cấp nghệ sĩ |
| Redis | Giới hạn đăng nhập admin và xác thực phiên ngồi máy cho API |
| Nginx | Chỉ bind `127.0.0.1:18473`; chuyển `/api`, `/socket` và web |

`shared/world.json` được tạo bởi `tools/generate-world.mjs` và dùng chung ở web/game server. Bản đồ gồm 5 hành lang × 20 hàng × 2 bên. Frontend chỉ dựng các máy gần avatar. Vị trí ghế và điều kiện chiếm ghế được kiểm tra tại game server.

## Dữ liệu và quyền

- Tài khoản dùng username, mật khẩu scrypt, cookie phiên HttpOnly; nickname không trùng không phân biệt chữ hoa/thường. WebSocket dùng vé Redis một lần có hạn 30 giây, không đưa cookie phiên dài hạn cho JavaScript. Ảnh avatar, hình nền PC, album và nền bảng vàng lưu ở volume `media_data`. Ảnh PC được nén phía client trước khi gửi. Mỗi hình nền mới được ghi cùng một giao dịch DB với ảnh album, nên người dùng sau vẫn thấy ảnh. Ảnh chat chỉ chuyển tới người đang online và lưu trong IndexedDB của từng trình duyệt; server không ghi chat vào DB.
- Bắt đầu với 60 phút. Game server trừ thời gian khi ngồi, gửi đồng hồ cho client và đưa avatar ra sân khi hết giờ. Người chơi có thể nhận phút từ người khác; giao dịch tặng và cộng thưởng ảnh do PostgreSQL xử lý.
- Tổng giây online được cộng khi kết nối game, ghi mỗi 5 giây và lúc rời phòng. Bảng tên người chơi hiển thị thời gian online, phút còn lại và cấp nghệ sĩ hiện tại. Camera dùng pointer lock khi nhấp vào cảnh; WASD di chuyển theo hướng camera và avatar xoay dần.
- Tác giả nhận 600 giây cho mỗi lượt thích hợp lệ. Mỗi tài khoản chỉ vote một lần trên ảnh, không tự vote. Unlike đòi hỏi đã dùng PC từ lúc ảnh đăng. Ảnh bị xóa khi có ít nhất 5 người dùng PC kể từ lúc đăng và số unlike lớn hơn một nửa số đó.
- Admin dùng tài khoản `.env`, Cloudflare Turnstile Siteverify ở server và giới hạn 8 lần thử/15 phút theo địa chỉ IP. Test key Turnstile trong `.env.example` chỉ dùng local. Model chỉ nhận upload GLB/GLTF tự chứa dữ liệu, tối đa 10 MB, có giấy phép; admin xem trước, cân kích thước và xuất bản.
- Browser trong PC chuyển URL video YouTube/TikTok sang player nhúng chính thức. Các URL HTTPS khác chỉ hiển thị nếu website đích cho phép iframe. Nhiều báo điện tử từ chối nhúng qua `X-Frame-Options` hoặc CSP; người dùng có thể mở trang trong tab ngoài.

## Giới hạn đang biết

- Mỗi game server process quản lý một phòng tối đa 250 người (200 máy và 50 chỗ chờ). Chưa có phân vùng nhiều phòng hoặc chuyển server khi tăng quy mô.
- Phút chơi được ghi sau mỗi 5 giây và khi đứng dậy/rời phòng; nếu process sập đột ngột có thể sai lệch tối đa khoảng 5 giây.
- Asset GLTF chứa URI ngoài không được nhập. Một số model quá nặng có thể làm giảm FPS dù frontend chỉ render máy gần người chơi.
- Gemini cần `GEMINI_API_KEY` của người dùng. API chỉ trả phương án bố trí; admin phải duyệt từng vật thể trước khi công bố.
- Local Docker chỉ bind loopback; chưa cấu hình HTTPS/Turnstile production và chưa chạy kiểm tải 200 người đồng thời.

## Chạy

Tạo `.env` từ `.env.example`, đổi `POSTGRES_PASSWORD` và `ADMIN_PASSWORD`, sau đó chạy `docker compose --env-file .env up -d --build`. Sau mỗi lần build lại API/web/game, cần cho Nginx khởi động lại để làm mới địa chỉ nội bộ: `docker compose --env-file .env up -d --force-recreate gateway`. Dữ liệu nằm trong volume `db_data` và `media_data`; `docker compose down` giữ lại chúng.
