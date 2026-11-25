# SmartHR - Hướng dẫn chạy local

Tài liệu này hướng dẫn chạy toàn bộ project trên một máy bằng Docker Compose và frontend Vite.

## 1. Yêu cầu

- Docker Desktop đang chạy.
- Git.
- Node.js 20 trở lên.
- Đang ở branch `user-service` sau khi merge `main`.

Kiểm tra branch:

```bash
git switch user-service
```

## 2. Cấu hình môi trường

Tạo file `.env` từ file mẫu:

```bash
cp .env.example .env
```

Các biến quan trọng:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
POSTGRES_PORT=5432

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
```

Có thể đổi các password trên. Không commit file `.env` lên Git.

## 3. Chạy backend và hạ tầng

Tại thư mục root của project:

```bash
docker compose --env-file .env up -d --build --remove-orphans
```

Compose sẽ chạy:

```text
postgres       PostgreSQL dùng chung
job-service    Job API
user-service   User/CV API
kafka          Message broker cho job-service
kafka-ui       Kafka UI
rabbitmq       Message broker cho user-service
redis          Redis
qdrant         Qdrant
minio          File storage cho user-service
keycloak       Authentication/authorization
```

Kiểm tra trạng thái:

```bash
docker compose ps
```

Xem log:

```bash
docker compose logs -f user-service
docker compose logs -f job-service
docker compose logs -f keycloak
```

## 4. Chạy frontend

Mở terminal khác:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Mở ứng dụng tại:

```text
http://localhost:5173
```

## 5. Các địa chỉ local

```text
Frontend:       http://localhost:5173
user-service:   http://localhost:8081
job-service:    http://localhost:8082
Keycloak:       http://localhost:8180
MinIO API:      http://localhost:9000
MinIO Console:  http://localhost:9001
RabbitMQ UI:    http://localhost:15673
Kafka UI:       http://localhost:8090
Kafka external: localhost:9095
PostgreSQL:     localhost:5432
```

## 6. Keycloak

Realm mặc định:

```text
smarthr
```

Master admin:

```text
Username: admin
Password: admin
```

SmartHR admin đã được import từ `keycloak/import/smarthr-realm.json`:

```text
Username: admin@smarthr.local
Password: admin123
Role: ADMIN
```

Tài khoản SmartHR admin dùng để gọi API của application. Tài khoản `admin/admin` chỉ dùng quản trị Keycloak master realm.

## 7. PostgreSQL

Một PostgreSQL container được dùng chung, nhưng các service dùng database riêng:

```text
job-service  -> job_db
user-service -> user_db
Keycloak     -> keycloak_db
```

Kết nối từ máy host:

```text
Host:     localhost
Port:     5432
Username: postgres
Password: giá trị POSTGRES_PASSWORD trong .env
```

Kết nối từ container:

```text
Host: postgres
Port: 5432
```

Kiểm tra database:

```bash
docker exec -it postgres-db psql -U postgres -d postgres -c "\\l"
```

Vào database user-service:

```bash
docker exec -it postgres-db psql -U postgres -d user_db
```

## 8. MinIO

Đăng nhập MinIO Console tại:

```text
http://localhost:9001
```

Thông tin đăng nhập lấy từ `.env`:

```text
Username: MINIO_ROOT_USER
Password: MINIO_ROOT_PASSWORD
```

Bucket dùng cho CV/attachment:

```text
cv-files
```

Upload attachment:

```http
POST http://localhost:8081/api/attachments
Authorization: Bearer <access-token>
Content-Type: multipart/form-data
```

Field upload:

```text
file: <file cần upload>
```

## 9. Một số API kiểm tra nhanh

Lấy danh sách position:

```bash
curl http://localhost:8080/api/v1/positions        # qua api-gateway; cần Bearer token
```

Lấy danh sách location:

```bash
curl http://localhost:8080/api/v1/locations        # qua api-gateway; cần Bearer token
curl http://localhost:8080/api/v1/jobs/locations   # địa điểm của job-service (công khai)
curl http://localhost:8080/api/v1/jobs/industries  # ngành nghề của job-service (công khai)
```

Lấy danh sách user, cần token có role `ADMIN`:

```bash
curl --location 'http://localhost:8080/api/v1/users' \
  --header 'Authorization: Bearer <access-token>'
```

Tạo job cần token có role `HR` (job-service tự verify JWT của Keycloak, không dùng header `X-User-*`):

```http
POST http://localhost:8080/api/v1/jobs
Authorization: Bearer <access-token của tài khoản HR>
```

## 10. Dừng project

```bash
docker compose down
```

Lệnh trên dừng và xóa container/network của Compose nhưng giữ lại volume dữ liệu.

Không dùng `-v` nếu chưa muốn xóa database và file MinIO.

## 11. Lỗi thường gặp

### Trùng port Kafka

SmartHR dùng port host `9095` cho Kafka để tránh trùng với Kafka khác đang chạy ở `9092`.

### Trùng tên container

Nếu có container cũ của project khác, dùng:

```bash
docker compose --env-file .env up -d --build --remove-orphans
```

Không xóa container của project khác nếu chưa kiểm tra tên/project.

### Thiếu password trong `.env`

Kiểm tra:

```bash
docker compose --env-file .env config --quiet
```

Nếu lỗi biến môi trường, kiểm tra `.env` có `POSTGRES_PASSWORD` và `MINIO_ROOT_PASSWORD`.

### Database chưa được tạo

File `docker/postgres/init_databases.sql` chỉ chạy khi PostgreSQL volume được tạo lần đầu. Nếu volume cũ đã tồn tại, kiểm tra database bằng lệnh `\\l` và tạo bổ sung nếu cần.

### user-service trả lỗi `/actuator/health`

`user-service` hiện chưa expose Spring Actuator health endpoint. Kiểm tra service bằng log:

```bash
docker compose logs --tail=200 user-service
```

Log hợp lệ cần có:

```text
Tomcat started on port 8081
Started UserCvApplication
```
