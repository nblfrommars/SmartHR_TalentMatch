import { toDateTimeLocal } from "./format";

/**
 * Ba mức kỹ năng, khớp cách ai-matching đọc cặp (mustHave, required) — JobRes.to_snapshot():
 *  - MUST     (mustHave=true)                  -> luật cứng: CV thiếu là tin bị loại khỏi gợi ý
 *  - REQUIRED (mustHave=false, required=true)  -> tính vào điểm kỹ năng, thiếu thì bị trừ điểm
 *  - BONUS    (mustHave=false, required=false) -> nice-to-have, cộng thêm điểm nếu khớp
 * BONUS là tiêu chí ngầm: chỉ HR chủ tin thấy, các giao diện khác ẩn đi (isPublicSkill).
 */
export const SKILL_KINDS = {
  MUST: { label: "Bắt buộc", mustHave: true, required: true },
  REQUIRED: { label: "Yêu cầu", mustHave: false, required: true },
  BONUS: { label: "Điểm cộng", mustHave: false, required: false },
};

/** Đọc kỹ năng từ JobRes giống ai-matching; required null coi như true (mặc định của job-service). */
export function skillKind(skill) {
  if (skill.mustHave) return "MUST";
  return skill.required === false ? "BONUS" : "REQUIRED";
}

/** Kỹ năng được hiện công khai (ẩn "Điểm cộng" với mọi người trừ HR chủ tin). */
export function isPublicSkill(skill) {
  return skillKind(skill) !== "BONUS";
}

const toMillion = (vnd) => (typeof vnd === "number" ? String(vnd / 1_000_000) : "");

/** JobRes (hoặc null khi tạo mới) -> state của JobForm. */
export function jobToForm(job) {
  return {
    companyName: job?.companyName || "",
    title: job?.title || "",
    description: job?.description || "",
    level: job?.level || "",
    jobType: job?.jobType || "",
    workMode: job?.workMode || "",
    industryId: job?.industry?.id || "",
    locationId: job?.location?.id || "",
    salaryMin: toMillion(job?.salaryMin),
    salaryMax: toMillion(job?.salaryMax),
    minYearsExp: typeof job?.minYearsExp === "number" ? String(job.minYearsExp) : "",
    deadline: job?.deadline ? toDateTimeLocal(job.deadline) : "",
    skills: job?.skills?.length
      ? job.skills.map((s) => ({ skill: s.skill, kind: skillKind(s) }))
      : [{ skill: "", kind: "REQUIRED" }],
  };
}
