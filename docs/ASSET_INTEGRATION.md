# Bổ sung asset GLB

MVP hiện dùng mesh tự tạo để mọi người có thể chạy ngay. Thư mục `apps/web/public/assets/` chỉ cần tạo khi đã có model được phép phân phối. Xem [ASSET_LICENSES.md](ASSET_LICENSES.md) trước khi thêm file.

1. Tải asset từ trang tác giả, giữ bản license hoặc ảnh chụp điều khoản cùng ngày tải trong hồ sơ dự án. Không đưa bản gốc có điều khoản cấm tái phân phối lên GitHub public.
2. Mở trong Blender. Đặt đơn vị mét, trục **Y hướng lên**, mặt trước theo **-Z**. Áp dụng transform; pivot của bàn/ghế/PC ở điểm chạm sàn, màn hình tại tâm bề mặt. Kiểm tra vật liệu và UV.
3. Chỉ xuất các mesh đang dùng sang **glTF 2.0 binary (.glb)**. Giữ texture ở kích thước hợp lý; thử KTX2/Meshopt sau khi xác minh tương thích loader và FPS. Dữ liệu collider và `seatAnchor` vẫn do game quản lý.
4. Đặt GLB đúng nhóm trong `apps/web/public/assets/{environment,furniture,computers,characters,decorations}/`. Cập nhật bảng giấy phép với đường dẫn file cụ thể.
5. Cài loader khi thật sự thêm GLB: `npm install -w @netverse/web @react-three/drei`. Dùng `useGLTF('/assets/...')` và clone scene khi nhân bản model có skeleton. Với nhiều model tĩnh giống nhau, dùng chung geometry/material hoặc `InstancedMesh`.
6. Kiểm tra ở 10 station trước khi tăng lên 30–50: network 404, kích thước tải, số draw call, FPS trên máy tầm trung, hướng đặt, shadow và collider. Chạy `npm run lint`, `npm run typecheck`, `npm run build`.

Asset hiện tại trong code không dùng GLB nên không có đường dẫn GLB nào có thể 404. Vùng click màn hình nằm trên `GamingStation`, còn thông tin ghế và bán kính tương tác nằm trong `lib/stations.ts`.
