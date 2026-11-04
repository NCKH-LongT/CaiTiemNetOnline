# Bổ sung asset GLB

MVP hiện dùng mesh tự tạo để mọi người có thể chạy ngay. Thư mục `apps/web/public/assets/` chỉ cần tạo khi đã có model được phép phân phối. Xem [ASSET_LICENSES.md](ASSET_LICENSES.md) trước khi thêm file.

1. Tải asset từ trang tác giả, giữ bản license hoặc ảnh chụp điều khoản cùng ngày tải trong hồ sơ dự án. Không đưa bản gốc có điều khoản cấm tái phân phối lên GitHub public.
2. Mở trong Blender. Đặt đơn vị mét, trục **Y hướng lên**, mặt trước theo **-Z**. Áp dụng transform; pivot của bàn/ghế/PC ở điểm chạm sàn, màn hình tại tâm bề mặt. Kiểm tra vật liệu và UV.
3. Chỉ xuất các mesh đang dùng sang **glTF 2.0 binary (.glb)**. Giữ texture ở kích thước hợp lý; thử KTX2/Meshopt sau khi xác minh tương thích loader và FPS. Dữ liệu collider và `seatAnchor` vẫn do game quản lý.
4. Đặt GLB đúng nhóm trong `apps/web/public/assets/{environment,furniture,computers,characters,decorations}/`. Cập nhật bảng giấy phép với đường dẫn file cụ thể.
5. Frontend đã dùng `GLTFLoader` từ Three.js qua `useLoader` trong admin preview và thế giới. Với nhiều model tĩnh giống nhau, dùng chung geometry/material hoặc `InstancedMesh` nếu FPS giảm; model có skeleton cần clone chuyên dụng.
6. Admin có thể tải file `.glb` hoặc `.gltf` tự chứa dữ liệu lên qua `/admin`, ghi nguồn/giấy phép, xem trước, chỉnh tỉ lệ/vị trí và xuất bản. Dữ liệu nằm trong Docker volume `media_data` và PostgreSQL, không nằm trong Git.
7. Kiểm tra cùng bản đồ 200 station: network 404, kích thước tải, số draw call, FPS trên máy tầm trung, hướng đặt, shadow và collider. Chạy `npm run lint`, `npm run typecheck`, `npm run build`.

Các máy PC mặc định vẫn là mesh tự tạo; vật thể admin xuất bản được tải qua `/api/media`. Vùng click màn hình nằm trên `GamingStation`, còn thông tin ghế và bán kính tương tác nằm trong `lib/stations.ts`.
