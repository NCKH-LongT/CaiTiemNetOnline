# NETVERSE 3D – nguồn và giấy phép asset

Kiểm tra ngày **04/11/2026**. MVP hiện tại chỉ sử dụng hình học, vật liệu và màu được tạo trong mã nguồn `apps/web/components/`. **Không có model hoặc texture bên ngoài trong repository.** Font DM Sans và Space Grotesk được trình duyệt tải từ Google Fonts; không có file font được đưa vào Git.

| Asset dự kiến | Tác giả | Nguồn và bằng chứng giấy phép | Quyền ghi công / phân phối file gốc | File đang dùng |
|---|---|---|---|---|
| Furniture Kit | Kenney | [Trang asset](https://kenney.nl/assets/furniture-kit) ghi CC0 | Không bắt buộc ghi công; CC0 cho phép phân phối | Chưa dùng |
| Modular Space Kit | Kenney | [Trang asset](https://kenney.nl/assets/modular-space-kit) ghi CC0 | Kiểm tra file license trong gói trước khi đưa vào repo | Chưa dùng |
| Space Station Kit | Kenney | [Trang asset](https://kenney.nl/assets/space-station-kit) ghi CC0 | Kiểm tra file license trong gói trước khi đưa vào repo | Chưa dùng |
| Low Poly PC Setup | BeeMaxStudio | [Trang asset](https://beemaxstudio.itch.io/gamingsetuppc) cho phép dùng cá nhân/thương mại, ghi công tùy chọn | **Chưa xác nhận quyền tái phân phối file gốc**; không commit pack | Chưa dùng |
| Low Poly Office & Tech Pack | reodesuxz | [Trang asset](https://reodesuxz.itch.io/low-poly-office-tech-pack) cho phép dùng cá nhân/thương mại, không yêu cầu ghi công | Trang ghi rõ **không bán lại hoặc phân phối lại file**; không commit pack | Chưa dùng |
| Rojatzo's Gaming Chair | Rojatzo | [Trang asset](https://rojatzo.itch.io/rojatzos-gaming-chair) ghi CC0 | Không bắt buộc ghi công; CC0 cho phép phân phối | Chưa dùng |
| Furniture Bits bản Free | Kay Lousberg | [Trang asset](https://kaylousberg.itch.io/furniture-bits) ghi CC0 cho bản Free | Không bắt buộc ghi công; tác giả đề nghị không bán bản chưa sửa đổi | Chưa dùng |
| Universal Base Characters bản Free | Quaternius | [Trang pack](https://quaternius.com/packs/universalbasecharacters.html) ghi CC0 | Kiểm tra `LICENSE` trong gói tải trước khi commit; [QAL hiện hành](https://quaternius.com/license.html) cấm phân phối asset như asset độc lập, nên không suy rộng CC0 từ pack này sang pack khác | Chưa dùng |

Các trang Poly Pizza và Sketchfab là **thư viện nhiều tác giả**; phải xác minh riêng tác giả, URL model, license, yêu cầu ghi công và quyền phân phối cho từng model trước khi tải hoặc commit.

Admin có thể tải GLB/GLTF trực tiếp lên Docker volume `media_data`. Từng asset bắt buộc nhập tên và nguồn/giấy phép trước khi xuất bản; các file này không được commit lên Git. Người quản trị chịu trách nhiệm kiểm tra quyền dùng và phân phối nội dung mình tải lên.

## Nguồn tải thủ công

1. [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
2. [BeeMaxStudio Low Poly PC Setup](https://beemaxstudio.itch.io/gamingsetuppc)
3. [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
4. [reodesuxz Office & Tech Pack](https://reodesuxz.itch.io/low-poly-office-tech-pack)
5. [Rojatzo's Gaming Chair](https://rojatzo.itch.io/rojatzos-gaming-chair)
6. [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits)

Các nguồn có thể yêu cầu thao tác tải trên trang, chọn phiên bản hoặc chấp nhận điều khoản. Không có file nào được tải tự động cho MVP. Khi thêm asset, ghi ngày kiểm tra mới, phiên bản license và đường dẫn từng file vào bảng trên.
