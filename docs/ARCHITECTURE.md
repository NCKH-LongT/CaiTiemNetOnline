# Kiến trúc và lộ trình NETVERSE

## MVP hiện tại

- **Web (Next.js + React Three Fiber):** phòng low poly, 10 station, avatar có chuyển động idle/đi/chạy/ngồi đơn giản, camera góc nhìn thứ ba, WASD/Shift, collider bàn, ghế và màn hình có thể click, E để ngồi/đứng. Có giao diện PC và tab chat cộng đồng.
- **Game (Colyseus):** một phòng `cafe`, tối đa 30 kết nối, đồng bộ vị trí, ghế và 50 tin nhắn gần nhất trong bộ nhớ. Server kiểm tra khoảng cách trước khi chiếm ghế và xử lý hai người chọn cùng máy. Mất kết nối sẽ thả ghế.
- **API:** endpoint `/api/ready` kiểm tra PostgreSQL và Redis. Chưa xử lý AI hoặc người dùng; hai dịch vụ dữ liệu được chuẩn bị cho các giai đoạn tiếp theo.
- **Gateway:** Nginx chỉ bind `127.0.0.1:18473`; `/socket/` bỏ prefix khi proxy sang Colyseus, `/api/` đi tới API, còn lại đi tới Next.

## Giới hạn và giai đoạn tiếp theo

1. **Avatar & thế giới:** thay avatar mesh bằng GLB có idle/walk/run/sit sau khi xác minh license. Bổ sung NavMesh, ánh sáng và tối ưu draw call.
2. **Multiplayer bền vững:** xác thực, vị trí server-authoritative đầy đủ, Redis presence, reconnect ngắn, chống spam và lưu trạng thái phòng. MVP hiện đồng bộ tức thời trong một process, chưa có reconnect và chưa an toàn cho triển khai public.
3. **AI tại PC:** thêm đăng nhập, quota, phiên chat riêng, SSE từ API tới OpenAI/Gemini qua server, xóa phiên khi rời ghế, kiểm thử chi phí và bảo mật. Giao diện hiện ghi rõ AI chưa mở để tránh gửi request tốn tiền khi chưa có bảo vệ.
4. **Hoàn thiện:** sofa, lễ tân, crown 1–3, admin, metric FPS và kiểm thử 30–50 máy.

## Chạy và kiểm thử

`npm run dev` chạy web ở 3000; `npm run dev:game` chạy Colyseus ở 2567. Trên localhost, web tự nối tới 2567. `npm run dev:api` cần PostgreSQL và Redis; cách chạy đầy đủ là Docker Compose. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` là các gate CI.

Với Docker, tạo `.env` từ `.env.example`, thay `POSTGRES_PASSWORD` bằng mật khẩu URL-safe, kiểm tra port 18473, rồi chạy `docker compose --env-file .env config --quiet` và `docker compose --env-file .env up -d --build`. Kiểm tra `/health`, `/api/ready`, `/socket/ready`, `/`. Dừng bằng `docker compose --env-file .env down` để giữ volume PostgreSQL. Không dùng `-v` nếu muốn giữ dữ liệu.
