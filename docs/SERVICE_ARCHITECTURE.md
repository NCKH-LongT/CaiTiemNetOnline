# Kế hoạch tách dịch vụ NETVERSE

## Trạng thái hiện tại

`compose.yaml` chạy các container `gateway`, `web`, `api`, `game`, `voice`, `redis`, `db`. Voice signaling đã tách khỏi game; âm thanh WebRTC đi trực tiếp giữa các trình duyệt. `game` vẫn xử lý vị trí, ghế, chat và trừ giờ. `api` vẫn chứa cả chức năng người chơi lẫn admin. Vì vậy việc sửa mã game hoặc API hiện vẫn có thể ảnh hưởng chức năng khác trong cùng process.

## Ranh giới dịch vụ đề xuất

| Dịch vụ | Trách nhiệm | Dữ liệu chính |
| --- | --- | --- |
| `gateway` | TLS, route, giới hạn request | Không lưu dữ liệu |
| `web` | Giao diện desktop/mobile, 3D, PC giả lập | Không lưu dữ liệu nghiệp vụ |
| `identity-api` | Tài khoản, đăng nhập, session, hồ sơ | PostgreSQL: players, sessions |
| `world-hub` | Vị trí, ghế, chat tức thời, quyền tương tác | Redis: presence, ghế; trạng thái phòng trong RAM |
| `billing` | Đồng hồ chơi và giao dịch phút | PostgreSQL: ledger, balance; Redis: lease/idempotency |
| `content-api` | Tranh, album, nhạc, vật thể | PostgreSQL + object storage |
| `admin-api` | Quyền admin, kiểm duyệt, cấu hình | PostgreSQL; mạng nội bộ |
| `voice` | Vé một lần, tìm người gần, báo hiệu WebRTC | Redis presence; không nhận luồng âm thanh |

Các container chỉ dùng Redis/PostgreSQL qua mạng nội bộ. Gateway là điểm truy cập công khai. Khi tách mã, mỗi service có schema hoặc quyền DB riêng; service khác gọi API/gRPC hoặc xử lý sự kiện, không sửa trực tiếp bảng của nhau. Tách `admin-api` khỏi `identity-api` sau khi đã tách middleware xác thực và quyền.

## Đồng bộ giờ và chống tính trùng

1. `world-hub` phát `seat.started` / `seat.ended` với `event_id`, `player_id`, `station_id` và thời gian server. Ghi vào Redis Stream (hoặc outbox PostgreSQL) trước khi xác nhận; không chỉ publish/subcribe vì subscriber có thể offline.
2. `billing` là **nguồn sự thật duy nhất** của số phút. Nó tiêu thụ sự kiện theo `event_id` duy nhất, tính lượng giây đã dùng theo thời gian server và ghi ledger + balance trong một transaction. Mỗi phiên ghế có lease Redis và heartbeat; hết lease thì đóng phiên, tránh tính giờ mãi khi hub sập.
3. API tặng phút và thưởng tranh cũng gọi `billing` với idempotency key. Web nhận số dư từ billing rồi hiển thị; không tự cộng/trừ làm nguồn sự thật.
4. Bắt đầu bằng Redis Streams vì stack đã có Redis và lưu lượng hiện nhỏ. Chỉ thêm Kafka khi cần lưu sự kiện dài hạn, nhiều consumer độc lập và throughput cao; Kafka không thay PostgreSQL cho ledger.

Trước khi chuyển, tạo migration cho ledger, chạy billing ở chế độ đọc đối chiếu với phép tính cũ, kiểm tra chênh lệch, rồi chuyển quyền ghi sang billing. Rollback bằng feature flag, không chạy hai writer cùng lúc.

## Mở rộng realtime và voice

Colyseus hiện có một phòng với giới hạn cấu hình 600 người (chưa kiểm tải ở mức này). Thêm nhiều phòng theo khu vực/quán, registry phòng trong Redis và chuyển người chơi qua gateway theo ticket ngắn hạn. Có thể giữ WebSocket/Colyseus; gRPC chỉ phù hợp cho trao đổi nội bộ, không thay thế WebSocket tới trình duyệt. Tải mục tiêu cần đo bằng test 200/500/1000 kết nối, tốc độ cập nhật vị trí, độ trễ P95 và tải Redis trước khi nâng số phòng.

Voice hiện dùng WebRTC P2P, bán kính 12 đơn vị thế giới, tối đa 6 peer/người; service signaling dùng ô không gian để tránh quét mọi cặp ở phòng đông. Âm lượng giảm theo bình phương khoảng cách. Cần HTTPS, quyền micro và STUN; một số mạng di động/NAT nghiêm ngặt sẽ cần TURN để kết nối. Có thể cấu hình `VOICE_TURN_URL` (`turn:`/`turns:`) và `VOICE_TURN_SECRET` cho API; coturn phải dùng `use-auth-secret` với cùng secret. API phát credential HMAC có hạn một giờ cho người chơi đã đăng nhập. Mở cổng relay trên máy chủ TURN và kiểm tra bằng hai mạng khác nhau. Khi tăng số người nói đồng thời hoặc băng thông upload của client trở thành nút thắt, thay phần media P2P bằng SFU (ví dụ LiveKit/mediasoup) theo phòng và khu vực; giữ logic bán kính/vé ở voice service. Đo số peer, bitrate upload, lỗi ICE, độ trễ và CPU trước khi chuyển.

## Thứ tự triển khai

1. Đã làm: voice service riêng, Redis presence có tọa độ, đường `/voice/`, health check.
2. Tách admin API khỏi API người chơi; định tuyến `/api/admin/` riêng, cấp quyền DB tối thiểu.
3. Tạo billing ledger + outbox/Redis Stream; chuyển logic tính giờ từ game sang billing theo từng giai đoạn.
4. Tách content API và object storage, rồi chia phòng world-hub khi test tải cho thấy cần.
5. Bổ sung TURN hoặc SFU cho voice theo kết quả thử mạng thật và kiểm tải.

Mỗi service có Dockerfile, health check, log có correlation ID, giới hạn CPU/RAM và pipeline triển khai riêng. Các thay đổi schema dùng migration tương thích ngược để phiên bản cũ/mới có thể chạy song song trong thời gian rollout.
