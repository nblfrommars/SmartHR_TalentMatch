# Kịch bản test giao diện TalentMatch

Kiểm thử thủ công toàn bộ giao diện frontend qua trình duyệt. Mỗi bước gồm **thao tác** và **kết quả mong đợi**. Bước nào không ra đúng kết quả thì ghi vào bảng ở cuối file.

Ký hiệu: `[ ]` chưa test, `[x]` đạt, `[!]` lỗi (ghi chi tiết ở mục 9).

---

## 0. Chuẩn bị

### 0.1 Chạy hệ thống

Chạy ở thư mục gốc dự án:

```bash
docker compose up -d                                   # toàn bộ backend
docker ps --format "{{.Names}} {{.Status}}"            # tất cả phải Up, không có Restarting
```

Kiểm tra nhanh:

| Kiểm tra | Mong đợi |
|---|---|
| `curl http://localhost:8080/actuator/health` | `200` (api-gateway) |
| `curl http://localhost:8084/health` | `{"status":"UP",...}` (notification-service) |
| `curl http://localhost:9000/minio/health/live` | `200` (MinIO, cần cho upload file) |
| Mở http://localhost:8180 | Trang Keycloak hiện ra |

Chạy frontend:

```bash
cd frontend
npm install
npm run dev        # mở http://localhost:5173
```

> Phải mở bằng `http://localhost:5173`. Keycloak chỉ chấp nhận redirect về địa chỉ này, dùng `127.0.0.1` sẽ không đăng nhập được.

### 0.2 Tài khoản dùng khi test

| Vai trò | Tài khoản | Cách có |
|---|---|---|
| Quản trị viên | `admin@smarthr.local` / `admin123` | Có sẵn trong realm Keycloak |
| Nhà tuyển dụng A | `hr_a` (email `hr_a@test.local`) | Tự đăng ký ở mục 2 |
| Nhà tuyển dụng B | `hr_b` (email `hr_b@test.local`) | Tự đăng ký ở mục 2 (dùng để test phân quyền) |
| Ứng viên | `uv_test` (email `uv_test@test.local`) | Tự đăng ký ở mục 2 |

Mật khẩu gợi ý cho tài khoản tự đăng ký: `Test@1234`.

**Mẹo:** dùng cửa sổ thường cho HR và cửa sổ ẩn danh cho ứng viên. Hai bên đăng nhập song song được, nên test được thông báo realtime.

### 0.3 Dữ liệu mẫu

- File CV mẫu: một file PDF bất kỳ dưới 5 MB, ví dụ `cv_nguyen_van_test.pdf`.
- Ảnh đại diện: một file JPG/PNG dưới 5 MB.
- Một file trên 5 MB (để test giới hạn dung lượng).

---

## 1. Khách (chưa đăng nhập)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1.1 | Mở `/` | [ ] Trang chủ tông đỏ kiểu VietnamWorks: thanh tìm kiếm lớn, "Việc làm mới nhất", "Ngành nghề trọng điểm". Header có "Đăng nhập" và "Đăng ký". |
| 1.2 | Gõ từ khóa (ví dụ `Java`), chọn địa điểm, bấm Tìm | [ ] Chuyển sang `/jobs?keyword=Java...`, danh sách chỉ gồm tin khớp từ khóa (theo tiêu đề, mô tả hoặc kỹ năng). |
| 1.3 | Ở `/jobs`, lần lượt lọc Ngành nghề, Địa điểm, Cấp bậc, Mức lương, Tên công ty | [ ] Số "Tìm thấy N việc làm" và danh sách thay đổi đúng. Chọn ngành hoặc tỉnh cha thì ra cả tin của ngành hoặc quận con. |
| 1.4 | Đổi "Sắp xếp": Mới nhất, Sắp hết hạn, Lương cao nhất | [ ] Thứ tự tin thay đổi tương ứng. |
| 1.5 | Lọc 3–4 lần liên tiếp rồi bấm nút **Quay lại** của trình duyệt | [ ] Quay về trang trước khi vào `/jobs` (ví dụ trang chủ), **không** lùi từng bước lọc. *(lỗi cũ trong problem.txt)* |
| 1.6 | Bấm "Xóa bộ lọc" | [ ] Mọi bộ lọc về mặc định, URL chỉ còn `/jobs`. |
| 1.7 | Chuyển trang (nếu có nhiều hơn 12 tin) | [ ] Trang mới hiện ra, cuộn lên đầu. |
| 1.8 | Bấm một tin | [ ] `/jobs/{id}` hiện tiêu đề, công ty, lương, địa điểm, hạn nộp, mô tả, kỹ năng (Bắt buộc / Yêu cầu / Điểm cộng), khung "Thông tin chung". Khung bên phải có nút **"Đăng nhập để ứng tuyển"**. |
| 1.9 | Mở `/jobs/00000000-0000-0000-0000-000000000000` | [ ] Thông báo "Tin tuyển dụng không tồn tại hoặc đã đóng". |
| 1.10 | Mở `/me`, `/hr/jobs`, `/admin/users`, `/notifications` | [ ] Mỗi trang hiện "Bạn cần đăng nhập" kèm nút Đăng nhập / Đăng ký. |
| 1.11 | Mở `/abc-xyz` | [ ] Trang 404 của TalentMatch. |
| 1.12 | Thu nhỏ cửa sổ về cỡ điện thoại (~375px) | [ ] Không bị tràn ngang; bộ lọc ẩn sau nút "Hiện bộ lọc". |

---

## 2. Đăng ký và đăng nhập

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 2.1 | Mở `/register`, bấm Đăng ký khi để trống | [ ] Báo lỗi đỏ dưới Username, Email, Mật khẩu. Không gửi request. |
| 2.2 | Username `ab`, email `abc`, mật khẩu `123`, nhập lại khác | [ ] Lần lượt báo: tối thiểu 3 ký tự, email không hợp lệ, tối thiểu 8 ký tự, mật khẩu không khớp. |
| 2.3 | Username có dấu cách (`hr a`) | [ ] "Không được chứa khoảng trắng". |
| 2.4 | Chọn Ngày sinh là hôm nay hoặc ngày tương lai | [ ] "Ngày sinh phải trước hôm nay". |
| 2.5 | Chọn **"Tôi là nhà tuyển dụng"**, đăng ký `hr_a` / `hr_a@test.local` / `Test@1234`, điền họ tên, chọn Giới tính, Ngày sinh | [ ] Toast xanh "Tạo tài khoản thành công...", tự chuyển sang trang đăng nhập Keycloak, email điền sẵn. |
| 2.6 | Đăng nhập bằng `hr_a` | [ ] Quay về TalentMatch, vào thẳng `/hr/jobs`. Header có chuông thông báo và avatar; menu avatar ghi "Nhà tuyển dụng". |
| 2.7 | Đăng xuất (menu avatar → Đăng xuất) | [ ] Về trang chủ, header hiện lại Đăng nhập / Đăng ký. |
| 2.8 | Đăng ký `hr_b` (nhà tuyển dụng) và `uv_test` (**"Tôi là ứng viên"**) theo cách trên | [ ] Đều thành công. Ứng viên sau khi đăng nhập vào `/me`. |
| 2.9 | Đăng ký lại với username `hr_a` | [ ] Báo "Username hoặc email đã được sử dụng" ngay dưới ô Username. |
| 2.10 | Đăng ký username mới nhưng email trùng `hr_a@test.local` | [ ] Hiện tại backend trả 502, nên toast báo "Không tạo được tài khoản..." (lỗi backend đã biết, xem mục 9). |
| 2.11 | Đang đăng nhập mà mở `/login` hoặc `/register` | [ ] Tự chuyển về trang chính của vai trò. |

---

## 3. Ứng viên (`uv_test`)

### 3.1 Tổng quan `/me`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.1.1 | Mở `/me` khi chưa có hồ sơ | [ ] 3 ô số liệu: Đơn đã nộp = 0, Đang được xem xét = 0, Độ hoàn thiện hồ sơ = 0%. Khung "Hồ sơ CV" liệt kê các mục còn thiếu. |

### 3.2 Hồ sơ CV `/me/cv`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.2.1 | Không điền gì, bấm **"Tạo hồ sơ"** | [ ] Toast **đỏ** "Hồ sơ chưa đủ thông tin...". Báo lỗi dưới Vị trí mong muốn (nếu danh mục vị trí có dữ liệu), Trình độ học vấn, Giới thiệu bản thân, Kỹ năng. **Không** hiện "Đã lưu hồ sơ". *(lỗi cũ trong problem.txt)* |
| 3.2.2 | Chỉ điền Giới thiệu, bấm lưu | [ ] Vẫn báo lỗi các mục còn thiếu. |
| 3.2.3 | Ở "Ảnh đại diện" chọn file JPG/PNG | [ ] Toast "Đã tải lên ... Nhớ bấm Lưu hồ sơ". Ảnh hiện trong ô. *(lỗi MinIO cũ trong problem.txt)* |
| 3.2.4 | Ở "File CV" chọn file PDF | [ ] Toast tải lên thành công, hiện tên file và dung lượng; nút xem mở được file. |
| 3.2.5 | Chọn file trên 5 MB | [ ] Toast đỏ báo file quá lớn. |
| 3.2.6 | Điền đủ: Vị trí, Trình độ, Học vấn, Giới thiệu; bấm "+ Thêm kỹ năng" 2–3 lần (ví dụ `Java` 4 năm, `Spring Boot` 3 năm, `Docker` 2 năm); bấm **"Tạo hồ sơ"** | [ ] Toast xanh "Đã tạo hồ sơ". Tiêu đề phụ đổi thành "Cập nhật thông tin...", nút đổi thành "Lưu hồ sơ". |
| 3.2.7 | Tải lại trang (F5) | [ ] Dữ liệu vừa lưu vẫn còn, kể cả ảnh và file CV. |
| 3.2.8 | Sửa giới thiệu, xóa 1 kỹ năng, bấm "Lưu hồ sơ" | [ ] Toast "Đã cập nhật hồ sơ"; F5 thấy đúng thay đổi. |
| 3.2.9 | Ô "Địa điểm làm việc" | [ ] Có ghi chú "Danh mục địa điểm của user-service đang trống" (bảng location của user-cv chưa có dữ liệu, xem mục 9). |
| 3.2.10 | Quay lại `/me` | [ ] Độ hoàn thiện hồ sơ tăng, hiện "Hồ sơ đã đầy đủ thông tin" nếu đã điền hết. |

### 3.3 Ứng tuyển

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.3.1 | Mở một tin đang tuyển do `hr_a` đăng (tạo ở mục 4.1) | [ ] Khung bên phải có "File CV gửi kèm" (Dùng CV trong hồ sơ / Tải file khác), "Thư giới thiệu", nút **"Ứng tuyển ngay"**. |
| 3.3.2 | Chọn "Dùng CV trong hồ sơ", viết thư giới thiệu, bấm Ứng tuyển | [ ] Toast "Ứng tuyển thành công!"; khung đổi thành "Bạn đã ứng tuyển lúc ..." kèm trạng thái "Đã nộp". |
| 3.3.3 | F5 trang tin đó | [ ] Vẫn hiện "Bạn đã ứng tuyển...", không cho nộp lại. |
| 3.3.4 | Ở tin khác, chọn "Tải file khác" nhưng không chọn file, bấm Ứng tuyển | [ ] Toast "Hãy chọn file CV để gửi kèm". |
| 3.3.5 | Chọn file PDF rồi ứng tuyển | [ ] Thành công. |
| 3.3.6 | Mở một tin đã đóng hoặc hết hạn (nếu còn thấy) | [ ] "Tin tuyển dụng này không còn nhận hồ sơ." |

### 3.4 Đơn ứng tuyển `/me/applications`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.4.1 | Mở trang | [ ] Liệt kê các đơn đã nộp: tên tin (bấm mở được), công ty, ngày nộp, trạng thái. |
| 3.4.2 | Bấm "Rút đơn" ở một đơn "Đã nộp", xác nhận | [ ] Toast "Đã rút đơn ứng tuyển"; trạng thái thành "Đã rút", nút Rút đơn biến mất. |
| 3.4.3 | Mở lại tin vừa rút | [ ] Hiện "Bạn đã ứng tuyển..." với trạng thái "Đã rút" (backend không cho nộp lại). |
| 3.4.4 | Đơn của tin đã bị HR đóng | [ ] Đơn vẫn hiện, chỗ tên tin ghi "Tin tuyển dụng đã đóng" (backend không còn trả thông tin tin cho người ngoài). |

### 3.5 Quyền của ứng viên

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.5.1 | Mở `/hr/jobs`, `/hr/jobs/new`, `/admin/users` | [ ] "Không có quyền truy cập". |
| 3.5.2 | Menu avatar và thanh bên | [ ] Chỉ có Tổng quan, Hồ sơ CV, Đơn ứng tuyển, Thông báo. |

---

## 4. Nhà tuyển dụng (`hr_a`)

### 4.1 Đăng tin `/hr/jobs/new`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.1.1 | Bấm "Đăng tin" khi để trống | [ ] Báo lỗi dưới mọi trường bắt buộc và "Cần ít nhất một kỹ năng". |
| 4.1.2 | Mở ô **"Loại hình"** | [ ] Có Toàn thời gian, Bán thời gian, Hợp đồng, Freelance. **Không còn "Thực tập".** *(yêu cầu trong problem.txt)* Ô "Cấp bậc" vẫn có "Thực tập sinh". |
| 4.1.3 | Lương tối thiểu 30, tối đa 20 (triệu) | [ ] "Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu". |
| 4.1.4 | Hạn nộp là thời điểm đã qua | [ ] "Hạn nộp phải ở tương lai". |
| 4.1.5 | Điền đủ: Tên công ty `Công ty Test A`, Chức danh `Senior Java Backend Developer`, Cấp bậc Senior, Loại hình Toàn thời gian, Hình thức Hybrid, Ngành, Địa điểm, Lương 25–40, Kinh nghiệm 3, Hạn nộp sau 1 tháng, Mô tả, kỹ năng `Java` (Bắt buộc), `Spring Boot` (Yêu cầu), `Kafka` (Điểm cộng); bấm Đăng tin | [ ] Toast "Đăng tin thành công!", tin mới nằm trong `/hr/jobs` với nhãn "Đang tuyển". |
| 4.1.6 | Mở `/jobs` ở cửa sổ khác (khách) | [ ] Thấy tin vừa đăng, lương hiển thị "25 – 40 triệu". |
| 4.1.7 | Đăng thêm 1 tin thứ hai (dùng để test đóng và xóa) | [ ] Thành công. |

### 4.2 Danh sách tin `/hr/jobs`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.2.1 | Xem một dòng tin | [ ] Các nút **Ứng viên, Sửa, Đóng, Xóa** nằm **cùng một hàng, cao bằng nhau**. |
| 4.2.2 | Chuyển tab Tất cả / Đang tuyển / Đã đóng | [ ] Danh sách lọc đúng; bấm Quay lại của trình duyệt không lùi từng tab. |
| 4.2.3 | Bấm Sửa, đổi lương và thêm 1 kỹ năng, bấm "Lưu thay đổi" | [ ] Toast "Đã cập nhật tin tuyển dụng", trang chi tiết hiện đúng dữ liệu mới. |
| 4.2.4 | Bấm Đóng ở tin thứ hai, xác nhận | [ ] Toast "Đã đóng tin tuyển dụng"; nhãn "Đã đóng"; nút Sửa và Đóng biến mất. |
| 4.2.5 | Khách mở link tin vừa đóng | [ ] "Tin tuyển dụng không tồn tại hoặc đã đóng". |
| 4.2.6 | `hr_a` mở link tin vừa đóng | [ ] Vẫn xem được (chủ tin), có nhãn "Đã đóng". |
| 4.2.7 | Bấm Xóa ở tin thứ hai, xác nhận | [ ] Toast "Đã xóa tin tuyển dụng", tin biến mất khỏi danh sách. |

### 4.3 Trang chi tiết tin của chính mình

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.3.1 | `hr_a` mở `/jobs/{id}` tin đang tuyển của mình | [ ] Khung bên phải ghi "Đây là tin tuyển dụng của bạn", có các nút **Sửa tin, Đóng tin, Xem ứng viên** nằm **thẳng hàng, cùng chiều cao**. *(lỗi cũ trong problem.txt)* |

### 4.4 Ứng viên của tin `/hr/jobs/{id}/applicants`

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.4.1 | Sau khi `uv_test` đã nộp đơn (mục 3.3), `hr_a` bấm "Ứng viên" | [ ] Thẻ tin ở đầu trang; danh sách đơn: "Ứng viên #xxxxxxxx", thời gian nộp, "Có file CV", trạng thái. |
| 4.4.2 | Bấm "Xem thư giới thiệu" | [ ] Hiện đúng nội dung ứng viên đã viết. |
| 4.4.3 | Bấm các nút lọc trạng thái (Đã nộp, Đã rút...) | [ ] Danh sách lọc đúng. |
| 4.4.4 | Tin chưa có ai nộp | [ ] "Chưa có ai ứng tuyển". |
| 4.4.5 | `hr_b` mở `/hr/jobs/{id tin của hr_a}/applicants` | [ ] "Bạn chỉ xem được ứng viên của tin do chính mình đăng." |

### 4.5 Thông báo realtime

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.5.1 | `hr_a` mở bất kỳ trang nào, để yên. Ở cửa sổ ẩn danh, `uv_test` ứng tuyển 1 tin **khác** của `hr_a` | [ ] Trong vài giây, không cần F5, chuông của `hr_a` hiện số đỏ và có toast "Thông báo mới: Có ứng viên mới". |
| 4.5.2 | `hr_a` bấm chuông | [ ] Danh sách thả xuống có "Có ứng viên mới — Một ứng viên vừa ứng tuyển vào ..."; dòng chưa đọc có nền đỏ nhạt và chấm đỏ; dòng trên cùng ghi "Đang nhận thông báo trực tiếp". |
| 4.5.3 | Bấm vào thông báo đó | [ ] Mở trang ứng viên của đúng tin, đơn vừa nộp được tô nền và ghi "Mới"; số trên chuông giảm 1. |
| 4.5.4 | Bấm "Xem tất cả thông báo" | [ ] `/notifications` liệt kê đầy đủ; có "Xem thêm" nếu nhiều hơn 20 thông báo. |
| 4.5.5 | Bấm "Đánh dấu đã đọc tất cả" | [ ] Toast "Đã đánh dấu N thông báo là đã đọc"; chuông về 0. |
| 4.5.6 | Mở 2 tab cùng `hr_a`, đánh dấu đã đọc ở tab 1 | [ ] Chuông ở tab 2 cũng cập nhật (tối đa vài giây). |
| 4.5.7 | Để trang mở hơn 5 phút rồi cho ứng viên nộp đơn tiếp | [ ] Vẫn nhận thông báo realtime (frontend tự gia hạn token cho WebSocket). |
| 4.5.8 | Tắt notification-service (`docker stop smarthr-notification-service`), F5 | [ ] Trang vẫn dùng được; trong chuông ghi "Cập nhật mỗi phút"; `/notifications` báo lỗi kèm nút Thử lại. Bật lại (`docker start ...`) thì tự kết nối lại. |

### 4.6 Phân quyền HR

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 4.6.1 | `hr_b` mở `/jobs/{id tin của hr_a}` | [ ] Không có nút Sửa/Đóng; ghi "Chỉ tài khoản ứng viên mới ứng tuyển được." |
| 4.6.2 | `hr_b` mở thẳng `/hr/jobs/{id tin của hr_a}/edit` | [ ] "Đây không phải tin tuyển dụng của bạn" (hoặc báo không có quyền khi lưu). |
| 4.6.3 | `hr_a` mở `/me/cv`, `/admin/users` | [ ] "Không có quyền truy cập". |

---

## 5. Quản trị viên (`admin@smarthr.local`)

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 5.1 | Đăng nhập admin | [ ] Vào `/admin/users`; menu có Người dùng, Vị trí, Thông báo. |
| 5.2 | Xem danh sách người dùng | [ ] Có `hr_a`, `hr_b`, `uv_test`... với Vai trò, Giới tính, Ngày sinh, Trạng thái. Tài khoản đăng ký ở mục 2 hiện đúng giới tính và ngày sinh đã chọn; tài khoản cũ ghi "Chưa khai báo" (không còn "null"). *(lỗi cũ trong problem.txt)* |
| 5.3 | Gõ tìm `hr_` | [ ] Chỉ còn tài khoản khớp. |
| 5.4 | Lọc vai trò "Nhà tuyển dụng" | [ ] Chỉ còn HR. |
| 5.5 | `/admin/positions`: thêm vị trí Mã `BE_DEV`, Tên `Backend Developer` | [ ] Toast "Đã thêm vị trí", vị trí hiện trong bảng. |
| 5.6 | Sửa tên vị trí | [ ] Toast "Đã cập nhật vị trí". |
| 5.7 | Ẩn một vị trí, xác nhận | [ ] Toast "Đã ẩn vị trí", vị trí biến mất. |
| 5.8 | Ứng viên mở `/me/cv` | [ ] Ô "Vị trí mong muốn" có vị trí vừa thêm, không còn vị trí đã ẩn. |
| 5.9 | Admin mở `/me/cv` hoặc `/hr/jobs` | [ ] "Không có quyền truy cập". |

---

## 6. Xử lý lỗi và trạng thái

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 6.1 | Tắt gateway (`docker stop smarthr-api-gateway`), F5 `/jobs` | [ ] Khung lỗi "Không tải được danh sách việc làm" kèm nút Thử lại. Bật lại rồi bấm Thử lại thì tải được. |
| 6.2 | Tắt Keycloak (`docker stop keycloak`), mở `/login` | [ ] "Không kết nối được tới Keycloak (cổng 8180)..."; các trang công khai vẫn xem được. |
| 6.3 | Tắt MinIO (`docker stop minio`), upload file ở `/me/cv` | [ ] Toast đỏ "Dịch vụ liên quan đang gặp sự cố...". Bật lại thì upload được. |
| 6.4 | Bấm liên tục (khoảng 60 lần) vào bộ lọc `/jobs` | [ ] Có thể gặp toast "Bạn thao tác quá nhanh..." (gateway giới hạn tốc độ request). |

---

## 7. Kiểm tra lại các lỗi trong `problem.txt`

| Lỗi cũ | Bước kiểm tra | Đạt |
|---|---|---|
| Nút "Sửa tin" và "Đóng tin" không thẳng hàng | 4.2.1, 4.3.1 | [ ] |
| Lọc nhiều lần rồi bấm Quay lại chỉ lùi một bước lọc | 1.5, 4.2.2 | [ ] |
| `/me/cv` lưu khi chưa điền vẫn báo "Đã lưu hồ sơ" màu xanh | 3.2.1, 3.2.2 | [ ] |
| Upload ảnh báo "Dịch vụ đang gặp sự cố" (MinIO) | 3.2.3, 3.2.4 | [ ] |
| Bỏ "Thực tập" ở phần chọn loại hình khi HR tạo tin | 4.1.2 | [ ] |
| `/admin/users` cột giới tính hiện null, form đăng ký không có giới tính | 2.5, 5.2 | [ ] |

---

## 8. Giới hạn đã biết (không tính là lỗi frontend)

Các điểm dưới đây do backend chưa hỗ trợ. Gặp khi test thì ghi nhận, không cần báo lỗi giao diện:

- Đăng ký trùng email báo 502 thay vì "email đã tồn tại".
- HR chỉ thấy mã ứng viên, chưa thấy tên/email, chưa mở được file CV, chưa đổi được trạng thái đơn.
- Tin đã đóng hoặc hết hạn thì trang "Ứng viên" báo không tìm thấy.
- Ứng viên không nhận thông báo nào (backend chưa phát event đổi trạng thái hay rút đơn).
- Danh mục địa điểm của user-cv trống, nên CV chưa chọn được nơi làm việc.
- Lọc "Mức lương" bỏ sót tin không ghi lương tối đa (lương thương lượng).
- Chưa có giao diện AI (gợi ý việc, tìm ứng viên, đọc CV), vì gateway chưa chuyển role xuống ai-matching.

---

## 9. Ghi lại lỗi phát hiện

| # bước | Trình duyệt | Mô tả lỗi | Ảnh chụp / log console | Mức độ (cao / vừa / thấp) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
