# Kế hoạch triển khai `update.md`

Ngày lập: 04/11/2026. Bản gốc yêu cầu nhiều hệ thống phụ thuộc nhau; thứ tự dưới đây giữ cho mỗi mốc có thể chạy và kiểm thử độc lập trên Docker local.

## 1. Thế giới và góc nhìn

- Đổi camera theo phía sau hướng di chuyển của avatar, có chuyển tiếp khi ngồi vào máy và chế độ xem thẳng màn hình PC.
- Dựng bản đồ mở 200 vị trí máy từ module thủ tục: 5 dãy hành lang × 20 hàng × 2 phía. Chỉ render các dãy gần người chơi để tránh 200 bộ mesh cùng lúc. Colyseus và frontend dùng chung định nghĩa vị trí; kiểm tra khoảng cách và tranh ghế trên server.
- Nguồn tham khảo cho môi trường tương lai: [Kenney Modular Space Kit](https://kenney.nl/assets/modular-space-kit) và [Space Station Kit](https://kenney.nl/assets/space-station-kit), trang nguồn ghi CC0. Không tải hoặc commit thêm asset cho tới khi kiểm tra file `LICENSE` trong gói. Bản chạy đầu dùng mesh tự dựng để không phụ thuộc nguồn ngoài.

## 2. Tài khoản, hồ sơ và thời gian chơi

- Đăng ký/đăng nhập người chơi, mật khẩu hash, nickname không trùng, fullname, ảnh profile; nút Save lưu trạng thái game. Phiên người chơi được kiểm tra phía server, không tin số phút hay vote do browser gửi.
- Thời gian bắt đầu tính khi server xác nhận ngồi vào máy. Server trừ phút theo thời gian thực, chặn ngồi khi hết giờ; UI hiện đồng hồ. Cơ chế xin và tặng phút là giao dịch nguyên tử trong DB, có nhật ký để tránh tặng hai lần.
- Mỗi tài khoản mới có **60 phút**. Khi về 0, server đưa avatar ra sân ngoài và khóa lối vào; người chơi có thể quỳ xin và nhận phút được tặng.

## 3. PC giả lập và phòng tranh

- Desktop PC hiển thị trên màn hình lớn ở giữa cảnh. App Browser chỉ nhúng URL HTTPS được website đích cho phép iframe. Trình duyệt game không thể bỏ qua `X-Frame-Options` hoặc CSP của trang đích.
- Người chơi vẽ bằng canvas hoặc tải ảnh làm wallpaper. Trạng thái PC tồn tại sau khi người chơi đứng dậy, để người dùng tiếp theo thấy. Album ảnh server, một vote mỗi tài khoản/ảnh, tính top 10 và bảng vàng. Ảnh bị xóa vĩnh viễn khi số unlike **lớn hơn 50%** số tài khoản đã sử dụng PC **từ lúc ảnh đăng**, với ít nhất **5 người dùng PC**. Mỗi like cộng 10 phút cho tác giả ảnh.
- Ảnh chat chỉ phát cho người đang online và giữ trong bộ nhớ trình duyệt của chính người nhận. Server không lưu nội dung/ảnh chat; khi người nhận offline thì không có hàng đợi tin nhắn.

## 4. Admin và biên tập thế giới

- Tài khoản admin từ biến môi trường, phiên admin riêng, giới hạn đăng nhập, Cloudflare Turnstile xác thực **ở server** trước khi cấp phiên. Nếu chưa cấu hình sitekey/secret, khóa đăng nhập admin thay vì bỏ qua CAPTCHA.
- Editor kéo thả vật thể từ catalog có giấy phép, lưu vị trí/rotation/scale và cho xem trước trước khi phát hành bản đồ. Gợi ý sắp xếp từ Gemini chỉ tạo phương án; admin xem và xác nhận trước khi áp dụng.
- Admin tải trực tiếp file `.glb` hoặc `.gltf` tự chứa dữ liệu (tối đa 10 MB) cùng nguồn/giấy phép. Có preview 3D, đo kích thước gốc, tỉ lệ gợi ý 2 m, chỉnh vị trí và tỉ lệ trước khi xuất bản. Không nhập qua URL ngoài.

## 5. Kiểm thử và phát hành local

- Migration DB có thể chạy lặp lại; test tranh ghế, username/nickname độc nhất, vote/bonus, ngưỡng xóa và quyền admin.
- Chạy lint, typecheck, test, build, Docker Compose, kiểm tra 200 máy, asset 404, chat, đăng nhập, các route qua gateway. Cập nhật PR; giữ production chưa deploy.

## Phụ thuộc quyết định

Các quyết định đã được người dùng xác nhận ngày 04/11/2026: 60 phút, ngưỡng unlike nêu trên, chỉ hỗ trợ trang được nhúng, avatar được lưu trên server, asset được tải lên dạng GLB/GLTF và admin cân chỉnh kích thước.
