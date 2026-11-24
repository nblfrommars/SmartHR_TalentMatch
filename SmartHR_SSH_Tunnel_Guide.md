# Hướng dẫn kết nối PostgreSQL AWS bằng SSH Tunnel -- SmartHR

**Đối tượng:** 3 thành viên phát triển SmartHR\
**EC2:** `13.211.56.245`\
**Region:** `ap-southeast-2` (Sydney)\
**Hệ điều hành server:** Ubuntu 24.04\
**Database:** PostgreSQL 16\
**Công cụ:** DBeaver + Git Bash (Windows)

------------------------------------------------------------------------

## 1. Mục tiêu và mô hình kết nối

Cả 3 thành viên sẽ kết nối đến **cùng một PostgreSQL đang chạy trên
EC2**. SSH Tunnel chỉ là đường hầm bảo mật từ máy cá nhân đến server; nó
không tạo database riêng.

-   Host PostgreSQL trong DBeaver: `localhost`
-   Port PostgreSQL trong DBeaver: `5432`
-   SSH host: `13.211.56.245`
-   SSH user: `ubuntu`
-   Các database hiện có: `job_db`, `user_db`, `keycloak_db`

Sơ đồ luồng kết nối:

``` text
Laptop Developer 1 ─┐
Laptop Developer 2 ─┼─ SSH Tunnel ──> EC2 13.211.56.245 ──> PostgreSQL :5432
Laptop Developer 3 ─┘
```

**Lưu ý:** PostgreSQL không cần và không nên mở port `5432` ra Internet.
Mỗi người chỉ cần được cấp quyền SSH và tài khoản PostgreSQL phù hợp.

------------------------------------------------------------------------

## 2. Phần quản trị viên chuẩn bị trên EC2

Thực hiện bằng tài khoản có quyền `sudo` trên EC2.

### 2.1. Kiểm tra PostgreSQL đang chạy

``` bash
cd ~/smarthr
docker compose -f docker-compose.aws.yml --env-file .env.aws ps postgres
```

Container cần ở trạng thái `Up` hoặc `healthy`.

Kiểm tra port được publish:

``` bash
docker compose -f docker-compose.aws.yml --env-file .env.aws port postgres 5432
```

Cấu hình mong muốn là:

``` text
127.0.0.1:5432
```

Nếu lệnh trả về `0.0.0.0:5432` hoặc không đúng như trên, **dừng lại và
kiểm tra compose trước khi chia sẻ kết nối**. Không tự ý mở inbound rule
`5432` trong Security Group.

### 2.2. Tạo SSH key riêng cho từng thành viên

Mỗi thành viên tự tạo key trên máy của mình (xem mục 3), rồi gửi
**public key** (`.pub`) cho quản trị viên qua kênh riêng.

Quản trị viên không yêu cầu và không nhận private key (`.pem` hoặc
private key không có đuôi `.pub`).

Trên EC2, tạo thư mục và file authorized_keys nếu chưa có:

``` bash
sudo install -d -m 700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
sudo touch /home/ubuntu/.ssh/authorized_keys
sudo chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys
sudo chmod 600 /home/ubuntu/.ssh/authorized_keys
```

Mở file để thêm public key:

``` bash
nano /home/ubuntu/.ssh/authorized_keys
```

Dán public key của từng thành viên vào **một dòng riêng**, lưu file.
Không xóa key đang dùng của quản trị viên.

Sau khi thêm, kiểm tra quyền:

``` bash
ls -ld /home/ubuntu/.ssh
ls -l /home/ubuntu/.ssh/authorized_keys
```

Quyền mong muốn: thư mục `.ssh` là `700`, file `authorized_keys` là
`600`, chủ sở hữu là `ubuntu`.

### 2.3. Cập nhật Security Group

Vào AWS Console → EC2 → Security Groups → Security Group đang gắn với
instance `smarthr-server` → Inbound rules.

-   Giữ HTTP `80` và HTTPS `443` theo cấu hình triển khai.
-   Với SSH `22`, thêm IP public hiện tại của từng thành viên theo dạng
    `x.x.x.x/32`.
-   Không để SSH là `0.0.0.0/0`.
-   Không thêm inbound rule PostgreSQL `5432`.

Mỗi thành viên cần tự xác định IP public mà kết nối SSH của họ thực sự
đi ra. Nếu IP thay đổi, quản trị viên cập nhật rule tương ứng. IP hiển
thị bởi một website kiểm tra IP đôi khi có thể khác IP mà AWS nhìn thấy;
nếu gặp timeout, xem mục 7.

**Không dùng chung file `smarthr-key.pem` của quản trị viên.** Mỗi thành
viên có key riêng để có thể thu hồi quyền từng người.

------------------------------------------------------------------------

## 3. Mỗi thành viên tạo SSH key trên Windows

Các lệnh dưới đây chạy trong **Git Bash trên laptop**, không chạy trong
phiên SSH trên EC2.

### 3.1. Tạo key riêng

Ví dụ Developer 2:

``` bash
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -C "smarthr-developer-2" -f ~/.ssh/smarthr-dev2
```

Thay `smarthr-developer-2` và `smarthr-dev2` bằng mã/tên phù hợp với
từng thành viên.

Khi được hỏi passphrase, nên đặt passphrase để bảo vệ private key. Hai
file được tạo:

-   `~/.ssh/smarthr-dev2` --- **private key**, giữ bí mật trên laptop.
-   `~/.ssh/smarthr-dev2.pub` --- **public key**, gửi cho quản trị viên.

### 3.2. Gửi public key cho quản trị viên

Hiển thị public key:

``` bash
cat ~/.ssh/smarthr-dev2.pub
```

Chỉ gửi nội dung của file `.pub`. Tuyệt đối không gửi file
`smarthr-dev2` (không có `.pub`), không gửi private key, passphrase hay
file `.env.aws`.

Quản trị viên thêm public key vào `/home/ubuntu/.ssh/authorized_keys`
theo mục 2.2.

------------------------------------------------------------------------

## 4. Cấu hình DBeaver trên từng laptop

Mỗi thành viên cài DBeaver và tạo một connection riêng cho mỗi database
cần làm việc.

### 4.1. Tạo PostgreSQL connection

1.  Mở DBeaver.
2.  Chọn **Database → New Database Connection**.
3.  Chọn **PostgreSQL**.
4.  Trong tab **Main**, nhập:

  Trường     Giá trị
  ---------- -------------------------------
  Host       `localhost`
  Port       `5432`
  Database   Ví dụ `job_db`
  Username   Tài khoản PostgreSQL được cấp
  Password   Mật khẩu PostgreSQL được cấp

Không điền IP EC2 vào trường Host của PostgreSQL khi dùng SSH Tunnel.

### 4.2. Bật SSH Tunnel

Mở tab **SSH** (tên tab có thể hơi khác tùy phiên bản DBeaver), bật
**Use SSH Tunnel** / **Enable SSH Tunnel**, rồi nhập:

  -------------------------------------------------------------------------
  Trường                              Giá trị
  ----------------------------------- -------------------------------------
  Host/IP                             `13.211.56.245`

  Port                                `22`

  User name                           `ubuntu`

  Authentication method               Public Key

  Private key                         Chọn private key của chính thành
                                      viên, ví dụ
                                      `C:\Users\<user>\.ssh\smarthr-dev2`

  Passphrase                          Passphrase đã đặt khi tạo key, nếu có
  -------------------------------------------------------------------------

Nếu DBeaver có trường Local port, chọn `5432` nếu cổng đó đang trống.
Nếu máy đã có PostgreSQL local dùng cổng `5432`, chọn một cổng local
khác, ví dụ `15432`, và đặt **Local port = 15432**. Khi đó cấu hình Main
vẫn trỏ đến `localhost:15432` (nếu DBeaver yêu cầu nhập port local theo
phiên bản đang dùng). Không thay đổi port PostgreSQL trên EC2.

Nhấn **Test Connection**. Nếu DBeaver hỏi tải PostgreSQL driver, chọn
Download/Download driver.

> DBeaver tự tạo và đóng SSH Tunnel khi mở/đóng connection. Không cần
> chạy thêm lệnh `ssh -L` trong Git Bash cùng lúc.

------------------------------------------------------------------------

## 5. Tạo các connection database

Có thể tạo ba connection riêng trong DBeaver:

  Connection name gợi ý           Database
  ------------------------------- ---------------
  `SmartHR - Job DB (AWS)`        `job_db`
  `SmartHR - User DB (AWS)`       `user_db`
  `SmartHR - Keycloak DB (AWS)`   `keycloak_db`

Các thông tin SSH giống nhau. Username/password PostgreSQL có thể giống
nhau nếu quản trị viên cấp như vậy, nhưng về bảo mật nên cấp user theo
nhu cầu và quyền tối thiểu.

**Không nên dùng tài khoản `postgres` cho thao tác hằng ngày của tất cả
developer.** Tài khoản này có quyền quản trị rất cao. Quản trị viên nên
tạo tài khoản riêng cho developer hoặc nhóm, chỉ cấp quyền cần thiết
trên đúng database/schema. Không gửi mật khẩu trong nhóm chat công khai.

------------------------------------------------------------------------

## 6. Kiểm tra kết nối và tính đồng nhất dữ liệu

Sau khi kết nối, chạy trong DBeaver:

``` sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
```

Để kiểm tra dùng chung database, một thành viên có thể tạo bảng thử
trong schema riêng được cho phép, thêm một bản ghi; thành viên khác truy
vấn bản ghi đó. Chỉ thực hiện nếu được cấp quyền và dùng schema/bảng thử
nghiệm phù hợp. Không tạo hoặc xóa dữ liệu thử trong bảng nghiệp vụ.

Mỗi thành viên đang kết nối đến cùng server/database sẽ nhìn thấy thay
đổi đã commit của người khác, tùy theo quyền truy cập và transaction
isolation.

------------------------------------------------------------------------

## 7. Xử lý lỗi thường gặp

### `Connection timed out` khi SSH

-   Kiểm tra EC2 đang chạy và Elastic IP vẫn là `13.211.56.245`.
-   Kiểm tra Security Group có inbound SSH `22` từ IP public hiện tại
    của thành viên.
-   Kiểm tra mạng hiện tại có chặn outbound SSH không.
-   Nếu IP thay đổi, gửi IP mới cho quản trị viên cập nhật Security
    Group.
-   Không khắc phục bằng cách mở SSH `0.0.0.0/0` lâu dài.

### `Permission denied (publickey)`

-   Đảm bảo DBeaver đang chọn đúng private key tương ứng với public key
    đã được thêm lên EC2.
-   Kiểm tra username SSH là `ubuntu`.
-   Kiểm tra public key đã được thêm đầy đủ, trên một dòng trong
    `authorized_keys`.
-   Kiểm tra quyền `.ssh` là `700`, `authorized_keys` là `600`.

### `Connection refused` ở PostgreSQL

-   Kiểm tra container PostgreSQL có đang chạy không.
-   Kiểm tra port publish bằng lệnh ở mục 2.1.
-   Kiểm tra SSH Tunnel đã được bật và kết nối thành công.
-   Kiểm tra Main Host/Port đang trỏ đến local port của tunnel.

### `password authentication failed`

-   Kiểm tra đúng username/password PostgreSQL được cấp.
-   Không nhầm password SSH key với password PostgreSQL.
-   Không gửi password vào nhóm chat hoặc ticket công khai.

### `Address already in use`

-   Local port trên laptop có thể đang được một ứng dụng khác sử dụng.
-   Chọn local port khác, ví dụ `15432`, trong cấu hình tunnel và trỏ
    connection Main đến đúng local port đó.

------------------------------------------------------------------------

## 8. Quy tắc bảo mật cho team

1.  Mỗi người có một SSH key riêng; không chia sẻ private key.
2.  Không commit `.env`, `.env.aws`, private key hoặc password lên Git.
3.  Không mở PostgreSQL `5432` ra `0.0.0.0/0`.
4.  Chỉ cho phép SSH từ IP public cần thiết (`/32`).
5.  Dùng tài khoản PostgreSQL riêng, quyền tối thiểu; hạn chế dùng
    `postgres`.
6.  Khi thành viên rời team, xóa public key tương ứng khỏi
    `authorized_keys` và thu hồi quyền database.
7.  Sao lưu database định kỳ; SSH Tunnel không thay thế backup.
8.  Không chạy migration phá hủy hoặc sửa dữ liệu production nếu chưa
    thống nhất với team.

------------------------------------------------------------------------

## 9. Checklist hoàn tất cho mỗi thành viên

-   [ ] Đã tạo SSH key riêng trên laptop.
-   [ ] Đã gửi public key `.pub` cho quản trị viên.
-   [ ] Quản trị viên đã thêm public key vào EC2.
-   [ ] IP public của thành viên đã được cho phép trong Security Group.
-   [ ] DBeaver đã bật SSH Tunnel với đúng private key.
-   [ ] Đã Test Connection thành công.
-   [ ] Đã kết nối đúng database được giao.
-   [ ] Không chia sẻ private key hoặc password.

**Thông tin cần quản trị viên cung cấp riêng cho từng thành viên:**
database được phép truy cập, PostgreSQL username, password qua kênh bảo
mật, và xác nhận IP đã được thêm vào Security Group.
