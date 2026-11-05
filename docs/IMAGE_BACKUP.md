# Quản lý ảnh và sao lưu Google Drive

Trang `/admin` hiển thị ảnh trong volume `media_data`, tổng dung lượng, ảnh không còn được tham chiếu và trạng thái sao lưu. Admin có thể xóa ảnh chat hoặc ảnh không còn được sử dụng. Ảnh đại diện, tranh, hình nền, bảng xếp hạng và huy hiệu đang dùng được giữ nguyên để tránh hỏng nội dung.

Ảnh chat được nén trong trình duyệt trước khi tải lên API. File gốc không bị giới hạn theo dung lượng; file sau nén phải đáp ứng giới hạn 2 MB của kho ảnh. Trình duyệt cần đủ bộ nhớ để mở file gốc. Ảnh chat đã tải lên nằm trong `media_data` và admin có thể xóa trong mục quản lý ảnh.

## Bật sao lưu Drive

1. Trong Google Cloud, bật Drive API và tạo OAuth 2.0 client. Lấy refresh token cho tài khoản Google được phép ghi vào thư mục đích, với quyền `https://www.googleapis.com/auth/drive` và `access_type=offline`. Xem [hướng dẫn OAuth của Google](https://developers.google.com/identity/protocols/oauth2/web-server) và [quyền Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
2. Đặt `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` trong `.env` của máy chạy API hoặc Jenkins Secret file `netverse-prod-env`, rồi khởi động lại API. Không đưa các giá trị này vào Git.
3. Trong `/admin` → **Quản lý ảnh và dung lượng**, nhập ID từ URL `https://drive.google.com/drive/folders/<ID>` và bấm **Lưu thư mục**. Bấm **Sao lưu ngay** để chạy tức thì.

API tự kiểm tra mỗi 5 phút và tải tối đa 10 ảnh đang sử dụng chưa được sao lưu trong mỗi lượt. Mục quản lý hiển thị lỗi từ lần chạy gần nhất. Đổi thư mục sẽ sao lưu lại ảnh vào thư mục mới. Xóa ảnh trên server không xóa bản sao trên Drive.
