# NETVERSE 3D – Danh sách nguồn Asset 3D & hướng dẫn tích hợp

> Tài liệu tổng hợp nguồn asset phục vụ dự án quán net AI 3D (Next.js, React Three Fiber, Three.js).  
> Ngày tổng hợp: 04/11/2026. **Giá, quyền tải, số lượng model và điều khoản giấy phép có thể thay đổi.** Hãy kiểm tra lại trang asset và LICENSE trước khi sử dụng, đặc biệt với repository public hoặc sản phẩm thương mại.

## 1. Mục tiêu và định dạng

- Dựng quán net 3D có 10 máy trong MVP, có thể mở rộng lên 30–50 máy.
- Mỗi bộ gồm bàn, ghế gaming, PC, màn hình, bàn phím, chuột; có vị trí ngồi và vùng tương tác.
- Có avatar 3D với animation đứng, đi, chạy, ngồi; có khu giao lưu, sofa, quầy lễ tân và đồ trang trí.
- **Ưu tiên `.glb`/`.gltf`**, low-poly, texture tối ưu, giấy phép rõ ràng. Dùng Blender để chuyển từ FBX/OBJ/BLEND nếu cần.

## 2. Thư viện asset tổng quát

| Nguồn | Link | Dùng cho | Lưu ý giấy phép |
|---|---|---|---|
| Kenney – Furniture Kit | https://kenney.nl/assets/furniture-kit | Bàn ghế, tủ, đồ nội thất | Thường là CC0; xác nhận trong gói tải |
| Poly Pizza | https://poly.pizza/ | PC, màn hình, bàn, ghế, đồ trang trí | Từng model có thể là CC0 hoặc CC BY; kiểm tra riêng |
| Quaternius | https://quaternius.com/ | Avatar low-poly, nhân vật, animation, environment | Đọc điều khoản Quaternius Asset License của từng gói |
| Sketchfab – Gaming Setup (downloadable) | https://sketchfab.com/search?type=models&q=gaming%20setup&features=downloadable | Gaming setup chi tiết, case, ghế, phụ kiện | Mỗi model có license khác nhau; downloadable không đồng nghĩa với tự do phân phối |
| KayKit – Furniture Bits | https://kaylousberg.itch.io/furniture-bits | Sofa, nội thất và khu vực cộng đồng | Theo thông tin nguồn, bộ này phát hành CC0; xác nhận khi tải |

## 3. Các bộ asset cho PC/gaming station

| Asset | URL | Thành phần/đặc điểm | Lưu ý |
|---|---|---|---|
| BeeMaxStudio – Low Poly PC Setup | https://beemaxstudio.itch.io/gamingsetuppc | Bàn, ghế, monitor, keyboard, mouse, PC | Phù hợp MVP; kiểm tra quyền sử dụng thương mại và phân phối file |
| BadNerd4 – Gaming Setup Low Poly | https://badnerd4.itch.io/gaming-setup-low-poly | Bộ bàn PC gaming, màn hình, chuột, bàn phím, phụ kiện; có thể có FBX/OBJ/BLEND | Kiểm tra điều khoản trước khi public |
| Melon Polygons – PC Setup Game Ready | https://sketchfab.com/3d-models/pc-setup-game-ready-4126abfe9895488181dbde961e836788 | Một gaming setup tối ưu cho realtime | CC Attribution theo trang được giới thiệu; phải ghi công và xác nhận license hiện tại |
| Low Poly Office & Tech Pack | https://reodesuxz.itch.io/low-poly-office-tech-pack | Thiết bị văn phòng/công nghệ: màn hình, PC, bàn phím, chuột, tai nghe... | Kiểm tra phiên bản, định dạng tải và license |
| Rojatzo's Gaming Chair | https://rojatzo.itch.io/rojatzos-gaming-chair | Ghế gaming nhiều màu | Theo thông tin nguồn, CC0; kiểm tra file đính kèm |

### Ưu tiên chọn cho bản thử nghiệm

1. **BeeMaxStudio PC Setup** cho bộ máy chủ đạo (có thể nhân bản nhiều vị trí).
2. **Kenney Furniture Kit** cho nền tảng nội thất.
3. **Quaternius** cho nhân vật và animation.
4. **Low Poly Office & Tech Pack** cho chi tiết thiết bị; **Rojatzo** để thêm biến thể ghế.
5. **KayKit Furniture Bits** cho khu sofa và tiếp khách.

Không nên tải cả năm bộ rồi đưa thẳng tất cả vào production: chỉ lấy model thật sự dùng, chuẩn hóa tỷ lệ, vật liệu và palette màu để tránh phong cách lộn xộn.

## 4. Danh sách asset cần có trong game

| Nhóm | Nội dung cần có | Ưu tiên |
|---|---|---|
| Room | Sàn, tường, trần, cửa, cửa kính, đèn | Bắt buộc |
| Gaming station | Bàn, ghế, PC case, màn hình, bàn phím, chuột | Bắt buộc |
| Avatar | Model nhân vật, idle/walk/run/sit/stand | Bắt buộc |
| Interaction | Seat anchor, PC screen mesh, collider, NavMesh (dữ liệu game, không nhất thiết là asset tải) | Bắt buộc |
| Social | Sofa, bàn trà, quầy lễ tân, bảng nội quy | Giai đoạn 2 |
| Decor | RGB LED, đèn neon, poster, cây, đồng hồ | Giai đoạn 2 |
| Game effects | Vương miện cấp 1–3, hiệu ứng trên đầu nhân vật | Giai đoạn 2 |

## 5. Cấu trúc thư mục đề xuất

```text
netverse-3d/
├── apps/
│   └── web/
│       └── public/
│           └── assets/
│               ├── environment/
│               │   ├── cafe-room.glb
│               │   ├── floor.glb
│               │   └── walls.glb
│               ├── furniture/
│               │   ├── gaming-desk.glb
│               │   ├── gaming-chair.glb
│               │   └── sofa.glb
│               ├── computers/
│               │   ├── gaming-pc.glb
│               │   ├── monitor.glb
│               │   ├── keyboard.glb
│               │   └── mouse.glb
│               ├── characters/
│               │   ├── avatar-a.glb
│               │   └── avatar-b.glb
│               └── decorations/
│                   └── neon-light.glb
├── docs/
│   └── ASSET_LICENSES.md
└── tools/
    └── asset-pipeline/
```

> Đây là cấu trúc dự kiến; không có nghĩa những file GLB nêu trên đã được tải hay tồn tại.

## 6. Tích hợp GLB với React Three Fiber

```tsx
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';

export function GamingPC({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  const { scene } = useGLTF('/assets/computers/gaming-pc.glb');
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  return <primitive object={model} position={position} />;
}

useGLTF.preload('/assets/computers/gaming-pc.glb');
```

- Nếu file chỉ có OBJ/FBX/BLEND: mở bằng Blender, chỉnh scale/pivot/orientation, kiểm tra vật liệu, **Export → glTF 2.0 (.glb)**.
- Các mô hình lặp lại nên dùng chung geometry/material, cân nhắc `InstancedMesh` khi có nhiều PC/ghế giống nhau.
- Tách **màn hình PC** thành mesh/collider riêng để bắt thao tác click; giao diện AI nên dùng HTML overlay khi người chơi ngồi vào ghế.
- Định nghĩa dữ liệu tương tác riêng: `stationId`, `seatAnchor`, `screenAnchor`, `occupiedBy`, `interactionRadius`.

## 7. Checklist tối ưu trước khi commit

- [ ] Có bằng chứng nguồn, tác giả, giấy phép cho từng model và texture.
- [ ] Giấy phép cho phép cách sử dụng dự kiến (commercial, redistribution nếu GitHub public).
- [ ] Chuẩn hóa định dạng GLB, tỷ lệ tính bằng mét, hướng đặt và pivot.
- [ ] Loại mesh/texture không dùng, giảm polygon và kích thước texture.
- [ ] Xem xét nén texture (KTX2/Basis) và geometry (Meshopt/Draco), kiểm tra tương thích loader.
- [ ] Bảo đảm vật liệu không bị mất sau export.
- [ ] Có collider hoặc vùng tương tác riêng cho ghế/màn hình.
- [ ] Test hiệu năng với 10 PC trước khi nhân rộng 30–50 PC.
- [ ] Kiểm tra build frontend và tải asset không lỗi 404.

## 8. Quyền sử dụng và phân phối asset

- **CC0:** thường cho phép sử dụng và chỉnh sửa rộng rãi, kể cả thương mại; vẫn nên lưu bằng chứng license.
- **CC BY:** cần ghi công tác giả theo giấy phép.
- **License riêng của marketplace:** đọc kỹ hạn chế về tái phân phối source/asset.
- Nếu repo **public**, việc đưa file model gốc trực tiếp vào git có thể bị coi là tái phân phối. Không làm như vậy nếu license không cho phép. Thay vào đó, giữ asset ở kho private hoặc cung cấp hướng dẫn tải tại nguồn.
- Lập `docs/ASSET_LICENSES.md` ghi: tên asset, tác giả, URL, license, ngày kiểm tra, yêu cầu attribution, quyền redistribution và danh sách file sử dụng.

## 9. Prompt giao cho Codex

```text
Bạn là Lead 3D Web Developer cho dự án NETVERSE 3D (Next.js + React Three Fiber).

Nguồn asset tham khảo:
- https://kenney.nl/assets/furniture-kit
- https://beemaxstudio.itch.io/gamingsetuppc
- https://reodesuxz.itch.io/low-poly-office-tech-pack
- https://rojatzo.itch.io/rojatzos-gaming-chair
- https://quaternius.com/
- https://kaylousberg.itch.io/furniture-bits

Yêu cầu:
1. Kiểm tra và ghi rõ giấy phép từng asset; không tự tải khi không có quyền.
2. Nếu nguồn không tải tự động được, tạo danh sách URL để tôi tải thủ công.
3. Chuẩn hóa asset hợp lệ về GLB, đúng scale, pivot và hướng trong Three.js.
4. Tạo một quán net low-poly 3D với 10 gaming stations, mỗi station có bàn, ghế,
   PC, màn hình, bàn phím, chuột.
5. Tạo component GamingStation tái sử dụng, có stationId, seatAnchor,
   screenAnchor, collider và interaction radius.
6. Khi avatar đến gần và nhấn E, thực hiện tương tác ngồi và mở UI PC.
7. Màn hình PC phải có vùng tương tác để tích hợp AI Chat sau này.
8. Tối ưu FPS, texture, draw calls, dung lượng và asset loading.
9. Tạo docs/ASSET_LICENSES.md và tài liệu hướng dẫn bổ sung asset.
10. Chạy lint, typecheck, build, kiểm tra lỗi asset 404 và tạo PR.

Không commit API key hoặc asset không rõ quyền phân phối. Không merge main
hay deploy production khi chưa có phê duyệt.
```

## 10. Lộ trình tích hợp

1. **MVP hình ảnh:** tải nội thất và PC setup, dựng phòng 10 máy.
2. **Tương tác:** thêm avatar, di chuyển, ghế, màn hình có thể click.
3. **Multiplayer:** đồng bộ trạng thái ghế và vị trí avatar qua game server.
4. **AI:** giao diện PC hỏi OpenAI/Gemini, phiên riêng và dọn dữ liệu khi rời ghế.
5. **Hoàn thiện:** crown 1–3, chat cộng đồng, trang trí, tối ưu và kiểm thử tải.

---

**Khuyến nghị:** Chỉ cần tải trước **Kenney Furniture Kit + BeeMaxStudio PC Setup + một gói nhân vật Quaternius** để có bản quán net 3D đầu tiên. Các bộ còn lại là tùy chọn nâng cấp.

---

## 11. Docker Compose: triển khai NETVERSE không xung đột các dự án Docker khác

### 11.1. Nguyên tắc

- Đặt **Compose project name cố định `netverse3d`** để tách tên container, network, volume của dự án khỏi các stack khác. Không dùng `container_name`, không dùng network bên ngoài theo tên chung.
- Dùng **host port 18473/TCP** cho HTTP ở bản thử nghiệm (có thể đổi qua `NETVERSE_HTTP_PORT`). Đây là port ít phổ biến hơn 80, 3000, 8080, nhưng **không đảm bảo không trùng**; phải kiểm tra port trước khi chạy. Chỉ có reverse proxy được publish, API, game server, Redis và PostgreSQL chỉ kết nối qua mạng nội bộ Docker.
- Với production public, nên đặt HTTPS reverse proxy ở biên (Caddy/Traefik/Nginx hiện có) trên 443, proxy tới `127.0.0.1:18473`. Không mở port 18473 ra Internet nếu chỉ cần reverse proxy trên máy chủ.
- Các URL browser `/api/...` và `/socket/...` được proxy cùng origin tới backend tương ứng, tránh yêu cầu user truy cập host port riêng.
- Tất cả các lệnh `docker compose` cần chạy trong thư mục dự án (hoặc chỉ định `-f`). Không dùng `docker system prune -a --volumes` trên host có nhiều dự án.

Kiểm tra port trên máy Linux trước khi deploy:

```bash
sudo ss -ltnp | grep ':18473 ' || echo 'Port 18473 currently has no listener'
# Port không có listener chưa có nghĩa là không bị firewall/daemon khác giữ trước lúc chạy.
```

### 11.2. File `compose.yaml` (mẫu kiến trúc – cần khớp Dockerfile/đường dẫn thực tế)

```yaml
name: netverse3d

services:
  gateway:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:${NETVERSE_HTTP_PORT:-18473}:80"
    volumes:
      - ./infra/nginx/netverse.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - web
      - api
      - game
    networks: [edge]

  web:
    image: netverse-web:${IMAGE_TAG:-local}
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      labels:
        org.netverse.project: netverse-3d
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "3000"
    expose: ["3000"]
    networks: [edge]

  api:
    image: netverse-api:${IMAGE_TAG:-local}
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      labels:
        org.netverse.project: netverse-3d
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "4000"
      DATABASE_URL: postgresql://netverse:${POSTGRES_PASSWORD:?Set_POSTGRES_PASSWORD}@db:5432/netverse
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY:?Set_OPENAI_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY:?Set_GEMINI_API_KEY}
    expose: ["4000"]
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    networks: [edge, data]

  game:
    image: netverse-game:${IMAGE_TAG:-local}
    build:
      context: .
      dockerfile: apps/game-server/Dockerfile
      labels:
        org.netverse.project: netverse-3d
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "2567"
      REDIS_URL: redis://redis:6379
    expose: ["2567"]
    depends_on: [redis]
    networks: [edge, data]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    networks: [data]

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: netverse
      POSTGRES_DB: netverse
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set_POSTGRES_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U netverse -d netverse"]
      interval: 10s
      timeout: 5s
      retries: 8
    networks: [data]

networks:
  edge:
  data:
    internal: true

volumes:
  db_data:
```

**Lưu ý bắt buộc:** file trên là *mẫu kiến trúc*, chưa phải file đã build và test trên repository. Tạo `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/game-server/Dockerfile` phù hợp với package manager và script thực tế. Next.js phải bind `0.0.0.0:3000`, API `0.0.0.0:4000`, Colyseus `0.0.0.0:2567`. Nếu mật khẩu PostgreSQL có ký tự URL-reserved (`@`, `:`, `/`, `#`, ...) cần URL-encode hoặc cấu hình kết nối qua biến tách rời. Không thay đổi tên database, volume hoặc password của PostgreSQL đã chạy mà không có kế hoạch migration/backup.

### 11.3. File `infra/nginx/netverse.conf`

```nginx
server {
    listen 80;
    server_name _;
    client_max_body_size 5m;

    location = /health {
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }

    location /api/ {
        proxy_pass http://api:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_buffering off; # AI token streaming / SSE
    }

    location /socket/ {
        proxy_pass http://game:2567;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Colyseus:** bảo đảm đường dẫn WebSocket mà client dùng thật sự là `/socket/` và server xử lý đúng prefix này; nếu bản Colyseus đang dùng yêu cầu `/` hoặc đường dẫn khác, phải chỉnh **đồng bộ proxy và client**. Nếu có ingress HTTPS phía trước, client cần dùng `wss://` qua origin HTTPS, không hardcode địa chỉ `ws://localhost`.

### 11.4. Secret/env và lệnh chạy

File `.env.example` chỉ chứa tên biến và placeholder **không phải secret thật**:

```dotenv
NETVERSE_HTTP_PORT=18473
POSTGRES_PASSWORD=replace-with-long-random-url-safe-password
OPENAI_API_KEY=replace-me
GEMINI_API_KEY=replace-me
IMAGE_TAG=local
```

Thêm `.env`, `.env.deploy`, `.env.production`, file credential và log chứa secret vào `.gitignore`; quản lý secret thật trong **Jenkins Credentials**. Hạn chế quyền đọc env vì Docker environment có thể được người có quyền quản trị Docker xem được. Dùng service secret / secret manager nếu cần mức bảo mật cao hơn.

```bash
cp .env.example .env  # chỉ trên môi trường dev; sửa giá trị tại máy, KHÔNG commit
chmod 600 .env
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
curl -fsS http://127.0.0.1:18473/health
docker compose --env-file .env ps
```

Gỡ riêng stack: `docker compose --env-file .env down` (không thêm `-v` khi muốn giữ dữ liệu PostgreSQL). **Không xóa `db_data`**, trừ khi có backup và yêu cầu hủy dữ liệu rõ ràng.

## 12. Jenkins CI/CD: `Jenkinsfile` tối ưu, không ảnh hưởng Docker khác

### 12.1. Điều kiện

- Jenkins agent chạy Linux, có Git, Node.js/Pnpm đúng phiên bản dự án, Docker Engine + Compose v2. Tài khoản agent phải có quyền sử dụng Docker (quyền này tương đương quyền quản trị host; dùng agent tin cậy, không cho PR không tin cậy chạy deploy).
- Tạo Jenkins **Secret file** credential ID `netverse-prod-env`, nội dung như `.env` hợp lệ và có `POSTGRES_PASSWORD`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NETVERSE_HTTP_PORT`.
- Webhook GitHub kích hoạt pipeline; branch PR chạy kiểm tra, **chỉ `main` deploy**. Nên yêu cầu review và checks pass trước khi merge `main`.
- Tạo `pnpm-lock.yaml`, `package.json` với scripts `lint`, `typecheck`, `test`, `build` trước khi áp dụng pipeline. Nếu dùng npm/yarn, điều chỉnh tương ứng.
- Jenkins agent deploy phải quản lý chính máy Docker production; nếu agent khác host thì cần cơ chế SSH/remote deploy an toàn riêng (mẫu này **không** tự SSH).

### 12.2. File `Jenkinsfile`

```groovy
pipeline {
  agent { label 'netverse-docker' }
  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', daysToKeepStr: '14'))
    timeout(time: 30, unit: 'MINUTES')
  }
  environment {
    COMPOSE_PROJECT_NAME = 'netverse3d'
    CI = 'true'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Dependencies & Quality') {
      steps {
        sh '''
          set -eu
          corepack enable
          pnpm install --frozen-lockfile
          pnpm lint
          pnpm typecheck
          pnpm test
          pnpm build
        '''
      }
    }
    stage('Build & Deploy Main') {
      when { branch 'main' }
      steps {
        withCredentials([file(credentialsId: 'netverse-prod-env', variable: 'DEPLOY_ENV')]) {
          sh '''
            set -eu
            export IMAGE_TAG="${GIT_COMMIT}"
            docker compose --env-file "$DEPLOY_ENV" config --quiet
            docker compose --env-file "$DEPLOY_ENV" build --pull
            docker compose --env-file "$DEPLOY_ENV" up -d --no-build --remove-orphans

            # HTTP gateway health; bổ sung checks API/game trước khi production.
            for i in $(seq 1 30); do
              if curl -fsS http://127.0.0.1:18473/health >/dev/null; then
                break
              fi
              if [ "$i" -eq 30 ]; then
                docker compose --env-file "$DEPLOY_ENV" ps
                exit 1
              fi
              sleep 2
            done
            docker compose --env-file "$DEPLOY_ENV" ps
          '''
        }
      }
    }
    stage('Cleanup old NETVERSE images') {
      when { branch 'main' }
      steps {
        sh '''
          set -eu
          # Chỉ xóa image không còn container sử dụng, gắn nhãn NETVERSE
          # và được tạo > 7 ngày trước. Không xóa image dự án khác.
          docker image prune -a -f \
            --filter 'label=org.netverse.project=netverse-3d' \
            --filter 'until=168h'
        '''
      }
    }
  }
  post {
    always { cleanWs(deleteDirs: true, notFailBuild: true) }
  }
}
```

**Quan trọng khi dùng Jenkins thực tế:**

1. Jenkinsfile là mẫu. `pnpm test` phải có script và không được thiếu lockfile. Node/Pnpm phải được cài đúng phiên bản trên agent. Plugin Jenkins `Workspace Cleanup` cần có nếu dùng `cleanWs`; hoặc đổi thành `deleteDir()` mặc định.
2. Nếu `GIT_COMMIT` không được cung cấp bởi job, tạo tag từ `git rev-parse --short=12 HEAD` (chú ý tag đồng nhất cho cả ba service). Compose dùng cùng tag khi build và up.
3. Stage kiểm tra HTTP `/health` chỉ chứng minh Nginx trả lời; trước khi phát hành thật nên thêm readiness endpoint cho `web`, `api`, game và smoke test tương tác; triển khai rollback theo version image đã giữ lại khi smoke test thất bại. Không coi pipeline mẫu là zero-downtime.
4. Lệnh `docker image prune -a` chỉ dọn **image không được container nào sử dụng**; nhãn giới hạn NETVERSE và `until=168h` giữ image gần đây, nhưng các image rollback cũ không được dùng có thể mất sau 7 ngày. Thay đổi retention theo chính sách rollback.
5. `docker compose up -d --remove-orphans` chỉ tác động các service thuộc Compose project `netverse3d`. Không chạy `docker system prune`, `docker volume prune`, `docker network prune`, hoặc `docker builder prune -a` trên host shared mà chưa đánh giá tác động.

### 12.3. Dọn Docker build cache có kiểm soát

Build cache khác với image. Cache Docker mặc định có thể dùng chung giữa nhiều repo, nên **không dọn builder mặc định hàng loạt**. Nếu Jenkins được cấu hình với một BuildKit builder riêng cho dự án, ví dụ `netverse-builder`, có thể dọn cache builder đó theo thời gian và dung lượng:

```bash
# Chỉ chạy SAU KHI đã tạo và sử dụng builder riêng 'netverse-builder'
docker buildx prune --builder netverse-builder --force \
  --filter 'until=168h' --keep-storage 5gb
```

**Không chạy lệnh này mặc định trong Jenkinsfile** cho tới khi xác minh các image NETVERSE thật sự build trên builder đó; nếu không thì lệnh không giải quyết cache của `docker compose build`. Nên theo dõi `docker system df` và dung lượng disk theo thời gian, giới hạn log Docker ở daemon trước khi tăng tần suất dọn.

### 12.4. Checklist deploy và rollback

- [ ] `docker compose config --quiet` PASS; đúng port và tên project.
- [ ] `pnpm lint`, `typecheck`, `test`, `build` PASS; Docker build PASS.
- [ ] API keys nằm trong Jenkins Credentials, không xuất ra log.
- [ ] Gateway `/health`, API readiness, Colyseus handshake và login smoke test PASS.
- [ ] Test reconnect, chiếm ghế đồng thời, xóa phiên AI khi rời ghế.
- [ ] Backup PostgreSQL có lịch kiểm thử restore; volume tồn tại qua redeploy.
- [ ] Khi lỗi production, có image tag trước đó để rollback; không chạy prune trước khi xác nhận phiên bản mới ổn định.
- [ ] Dọn đúng image có nhãn `org.netverse.project=netverse-3d`, không đụng các Docker stack khác.

## 13. Prompt bổ sung để Codex hiện thực hóa Docker/Jenkins trong repo

```text
Đọc NETVERSE_3D_ASSET_GUIDE.md, đặc biệt mục 11–12.
Tạo và kiểm thử thực tế: compose.yaml, infra/nginx/netverse.conf,
apps/web/Dockerfile, apps/api/Dockerfile, apps/game-server/Dockerfile,
.env.example, .dockerignore và Jenkinsfile phù hợp với monorepo hiện tại.

Yêu cầu:
- Project name là netverse3d, host port HTTP mặc định 18473 (đổi qua env).
- Chỉ bind gateway ra 127.0.0.1, còn API/game/Redis/Postgres chạy mạng nội bộ.
- WebSocket /socket/ và /api/ hoạt động qua cùng origin; có AI SSE streaming.
- Secrets chỉ từ env/Jenkins Credentials, không commit key.
- CI chạy quality/build trước deploy; chỉ main được deploy.
- Gắn label org.netverse.project=netverse-3d vào image do dự án build.
- Chỉ dọn unused images có đúng label, cũ hơn 168h; không prune volumes.
- Không dọn global build cache; nếu cần cache prune, tạo builder riêng.
- Bổ sung readiness/smoke tests và rollback trước khi production.
- Xác minh từng file, path và script theo source thực tế; không giả định
  service tồn tại nếu chưa triển khai. Tạo PR kèm kết quả test.
```
