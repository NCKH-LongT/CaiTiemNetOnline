# PROJECT: NETVERSE 3D – AI Internet Café

Bạn là Lead Full-stack Developer, 3D Game Developer và DevOps Engineer.

Hãy phát triển game quán net online 3D chạy trên trình duyệt.

Repository: (https://github.com/NCKH-LongT/CaiTiemNetOnline.git)

## Công nghệ
- Next.js, TypeScript
- React Three Fiber, Three.js
- Colyseus Multiplayer
- Node.js backend
- Redis quản lý phiên
- PostgreSQL
- OpenAI API và Gemini API
- Docker, GitHub Actions, Vercel

## Chức năng
1. Quán net 3D có nhiều máy tính, bàn ghế.
2. Người chơi vào phòng được spawn thành avatar 3D.
3. Di chuyển bằng WASD, camera góc nhìn thứ ba.
4. Nhấn E để ngồi vào PC còn trống.
5. Camera zoom vào màn hình và mở UI chat AI.
6. Mỗi người có session AI độc lập, giữ ngữ cảnh khi sử dụng PC.
7. Đứng lên hoặc thoát thì hủy phiên AI; hỗ trợ reconnect ngắn khi mất mạng.
8. PC có tab Community Chat để người chơi trao đổi.
9. Phía trên nhân vật có nickname, vương miện cấp 1, 2, 3 theo thời gian hoạt động.
10. Có trang admin quản lý phòng, máy tính, người chơi và API quota.

## Quy trình thực hiện
- Kiểm tra repository và môi trường trước khi sửa.
- Xây dựng tài liệu kiến trúc, game design và kế hoạch milestone.
- Tạo nhánh develop và các feature branch phù hợp.
- Triển khai MVP theo từng milestone, bắt đầu từ game 3D cơ bản.
- Chạy lint, typecheck, build và các bài test khả thi.
- Sửa những lỗi có thể tái hiện.
- Tạo pull request kèm mô tả thay đổi và kết quả kiểm thử.
- Không commit API keys.
- Không tự ý merge vào main hoặc triển khai production khi chưa được phê duyệt.

Hãy bắt đầu với MVP có một phòng 3D, 10 PC, một avatar điều khiển được và khả năng ngồi máy. Sau đó lần lượt phát triển multiplayer và AI.