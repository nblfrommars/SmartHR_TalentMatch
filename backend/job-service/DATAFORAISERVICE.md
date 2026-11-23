# Dữ liệu job-service gửi sang ai-service

Job-service gửi dữ liệu qua Kafka, topic `job.events`. Phần `data` của message là `JobRes`, gồm các DTO bên dưới. Tài liệu này chỉ liệt kê trường theo từng DTO (lấy từ `dto/res`), không gồm trường `companyId`.

Thư mục DTO: `src/main/java/com/smarthr/job/dto/res/`

## JobRes

Nằm ở `JobRes.java`. Đây là DTO gốc, là toàn bộ nội dung trong `data` của event.

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `createdBy` | UUID | |
| `companyName` | String | |
| `title` | String | |
| `description` | String | |
| `level` | JobLevel | `INTERN`, `FRESHER`, `JUNIOR`, `MIDDLE`, `SENIOR`, `LEAD`, `MANAGER` |
| `jobType` | JobType | `PART_TIME`, `FULL_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |
| `workMode` | WorkMode | `ONSITE`, `HYBRID`, `REMOTE` |
| `location` | LocationRes | Xem mục LocationRes |
| `industry` | IndustryRes | Xem mục IndustryRes |
| `salaryMin` | Long | |
| `salaryMax` | Long | |
| `minYearsExp` | Integer | |
| `deadline` | OffsetDateTime | |
| `status` | JobStatus | `DRAFT`, `OPEN`, `CLOSED` |
| `version` | Integer | |
| `createdAt` | OffsetDateTime | |
| `updatedAt` | OffsetDateTime | |
| `publishedAt` | OffsetDateTime | |
| `skills` | List&lt;JobSkillRes&gt; | Xem mục JobSkillRes |

## LocationRes

Nằm ở `LocationRes.java`. Là kiểu của trường `location` trong `JobRes`.

| Trường | Kiểu |
|---|---|
| `id` | UUID |
| `name` | String |
| `parentId` | UUID |

## IndustryRes

Nằm ở `IndustryRes.java`. Là kiểu của trường `industry` trong `JobRes`.

| Trường | Kiểu |
|---|---|
| `id` | UUID |
| `name` | String |
| `parentId` | UUID |

## JobSkillRes

Nằm ở `JobSkillRes.java`. Là kiểu của mỗi phần tử trong mảng `skills` của `JobRes`.

| Trường | Kiểu |
|---|---|
| `skill` | String |
| `mustHave` | Boolean |
| `required` | Boolean |
