# Chạy CI/CD NETVERSE trên Jenkins

Log `npm: not found` xuất hiện vì job chạy trên Jenkins controller qua `agent any`. Pipeline hiện dùng agent riêng có nhãn `netverse-docker`, Node.js 22, npm, Docker CLI và Docker Compose. Agent phải kết nối được Docker daemon của **máy sẽ chạy NETVERSE**.

## Tạo agent trên máy triển khai

1. Trong Jenkins, tạo **Permanent Agent** tên `netverse-docker`, đặt **Labels** là `netverse-docker`, **Remote root directory** là `/srv/netverse-jenkins-agent`, và chọn **Launch agent by connecting it to the controller**. Lấy secret của agent từ trang hướng dẫn kết nối mà Jenkins hiển thị.
2. Trên máy chạy Docker, clone repository này, tạo hai thư mục cố định và điền thông tin kết nối:

   ```bash
   sudo mkdir -p /srv/netverse-jenkins-agent /srv/netverse-deploy
   cp infra/jenkins/agent.env.example infra/jenkins/agent.env
   # Sửa JENKINS_URL, JENKINS_SECRET trong infra/jenkins/agent.env.
   # Nếu Jenkins ở cùng máy và cổng 8080 được publish, dùng:
   # JENKINS_URL=http://host.docker.internal:8080/
   docker compose --env-file infra/jenkins/agent.env -f infra/jenkins/agent-compose.yaml up -d --build
   ```

3. Kiểm tra agent đã online trong Jenkins và thử công cụ:

   ```bash
   docker compose --env-file infra/jenkins/agent.env -f infra/jenkins/agent-compose.yaml exec agent node --version
   docker compose --env-file infra/jenkins/agent.env -f infra/jenkins/agent-compose.yaml exec agent npm --version
   docker compose --env-file infra/jenkins/agent.env -f infra/jenkins/agent-compose.yaml exec agent docker info
   docker compose --env-file infra/jenkins/agent.env -f infra/jenkins/agent-compose.yaml exec agent docker compose version
   ```

Agent dùng Docker socket của máy triển khai và có quyền điều khiển Docker trên máy đó; chỉ chạy agent này trên máy tin cậy. File `infra/jenkins/agent.env` chứa secret và đã được Git/Docker build bỏ qua.

## Cấu hình job

- Job có thể là **Pipeline script from SCM**, chọn nhánh `main` và Jenkinsfile ở gốc repository. Pipeline tự nhận diện commit đang chạy có đúng HEAD của `origin/main` hay không; các nhánh khác chỉ chạy kiểm tra chất lượng.
- Tạo Jenkins credential loại **Secret file**, ID `netverse-prod-env`. Nội dung là file `.env` cho production theo `.env.example`, gồm `POSTGRES_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, cặp Turnstile production và các biến cần thiết. Không lưu file này trong Git.
- Khi job `main` qua kiểm tra, Jenkins sẽ chờ nút **Deploy** ở bước phê duyệt. Sau đó code được chép vào `/srv/netverse-deploy/releases/<commit>`, build image, khởi động Compose và kiểm tra các endpoint qua gateway. Release cũ được giữ để rollback; workspace tạm của Jenkins được dọn sau job.
- Gateway chỉ bind `127.0.0.1:${NETVERSE_HTTP_PORT:-18473}` trên máy triển khai. Nếu muốn truy cập từ ngoài, cấu hình reverse proxy/HTTPS riêng trên máy đó.

Nếu job báo **‘Jenkins’ doesn’t have label ‘netverse-docker’**, nhãn trong Jenkinsfile chưa có node tương ứng: tạo Permanent Agent ở bước 1 với đúng nhãn, rồi khởi động container ở bước 2. Jenkinsfile không tự tạo agent. Nếu job chỉ hiện **Waiting for next available executor on ‘netverse-docker’**, agent chưa online hoặc đã hết executor. Nếu bước **Check agent tools** báo lỗi Docker, kiểm tra socket `/var/run/docker.sock` trên máy triển khai và lệnh `docker info` bên trong agent.
