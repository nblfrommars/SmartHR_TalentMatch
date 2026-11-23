export const LEVEL_LABELS = {
  INTERN: "Thực tập sinh",
  FRESHER: "Fresher",
  JUNIOR: "Junior",
  MIDDLE: "Middle",
  SENIOR: "Senior",
  LEAD: "Lead",
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
