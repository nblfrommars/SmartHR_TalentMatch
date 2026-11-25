export const LEVEL_LABELS = {
  INTERN: "Internship",
  FRESHER: "Fresher",
  JUNIOR: "Junior",
  MIDDLE: "Middle",
  SENIOR: "Senior",
  LEAD: "Leader",
  MANAGER: "Quản lý",
};

export const JOB_TYPE_LABELS = {
  FULL_TIME: "Toàn thời gian",
  PART_TIME: "Bán thời gian",
  CONTRACT: "Hợp đồng",
  INTERNSHIP: "Thực tập",
  FREELANCE: "Freelance",
};

export const WORK_MODE_LABELS = {
  ONSITE: "Tại văn phòng",
  HYBRID: "Hybrid",
  REMOTE: "Từ xa",
};

export const JOB_STATUS_LABELS = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  OPEN: { label: "Đang tuyển", tone: "success" },
  CLOSED: { label: "Đã đóng", tone: "danger" },
};

/** EduLevel của user-service: JSON là số 0–7. */
export const EDU_LEVELS = [
  { value: 0, label: "Đã tốt nghiệp THCS" },
  { value: 1, label: "Đã tốt nghiệp THPT" },
  { value: 2, label: "Tốt nghiệp trung cấp" },
  { value: 3, label: "Tốt nghiệp cao đẳng" },
  { value: 4, label: "Tốt nghiệp đại học" },
  { value: 5, label: "Cao học" },
  { value: 6, label: "Sinh viên" },
  { value: 7, label: "Khác" },
];

export const ROLE_LABELS = { USER: "Ứng viên", HR: "Nhà tuyển dụng", ADMIN: "Quản trị viên" };

/** Enum Gender của user-cv. NOINFO = người dùng không khai báo. */
export const GENDER_LABELS = { NOINFO: "Không tiết lộ", MALE: "Nam", FEMALE: "Nữ" };

export function formatDateTime(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/** ISO (có múi giờ) -> giá trị cho <input type="datetime-local"> theo giờ máy. */
export function toDateTimeLocal(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Giá trị datetime-local -> ISO có múi giờ (backend nhận OffsetDateTime). */
export function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatFileSize(bytes) {
  if (typeof bytes !== "number") return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", quá 7 ngày thì ghi ngày. */
export function timeAgo(value, now = Date.now()) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} ngày trước`;
  return formatDate(value);
}

export function shortId(id) {
  return id ? String(id).slice(0, 8) : "";
}

function toMillion(value) {
  return Number((value / 1_000_000).toFixed(1)).toString();
}

/** Lương lưu bằng VND, hiển thị theo triệu. */
export function formatSalary(min, max) {
  const hasMin = typeof min === "number";
  const hasMax = typeof max === "number";
  if (hasMin && hasMax) return min === max ? `${toMillion(min)} triệu` : `${toMillion(min)} – ${toMillion(max)} triệu`;
  if (hasMin) return `Từ ${toMillion(min)} triệu`;
  if (hasMax) return `Đến ${toMillion(max)} triệu`;
  return "Thương lượng";
}

/** Số ngày còn lại tới hạn nộp (làm tròn lên); null nếu không hợp lệ. */
export function daysLeft(deadline, now = Date.now()) {
  const time = Date.parse(deadline);
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now) / 86_400_000);
}

export function deadlineLabel(deadline, now = Date.now()) {
  const days = daysLeft(deadline, now);
  if (days === null) return "";
  if (days < 0) return "Đã hết hạn";
  if (days === 0) return "Hết hạn hôm nay";
  return `Còn ${days} ngày`;
}

export function formatDate(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString("vi-VN");
}

/** "Quận 1, Hồ Chí Minh": ghép tên con với tên cha (API chỉ trả name và parentId). */
export function buildLabel(item, list = []) {
  if (!item) return "";
  const parent = item.parentId ? list.find((entry) => entry.id === item.parentId) : null;
  return parent ? `${item.name}, ${parent.name}` : item.name;
}

/** Danh sách phẳng (parentId) thành cây hai cấp, sắp theo tên. */
export function toTree(list = []) {
  const byName = (a, b) => a.name.localeCompare(b.name, "vi");
  return list
    .filter((entry) => !entry.parentId)
    .sort(byName)
    .map((parent) => ({
      ...parent,
      children: list.filter((entry) => entry.parentId === parent.id).sort(byName),
    }));
}
