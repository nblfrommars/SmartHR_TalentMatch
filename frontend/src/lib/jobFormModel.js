import { toDateTimeLocal } from "./format";

// Ba mức kỹ năng tương ứng cặp (mustHave, required) của job-service
export const SKILL_KINDS = {
  MUST: { label: "Bắt buộc phải có", mustHave: true, required: true },
  REQUIRED: { label: "Yêu cầu", mustHave: false, required: true },
  NICE: { label: "Điểm cộng", mustHave: false, required: false },
};

function kindOf(skill) {
  if (skill.mustHave) return "MUST";
  return skill.required === false ? "NICE" : "REQUIRED";
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
      ? job.skills.map((s) => ({ skill: s.skill, kind: kindOf(s) }))
      : [{ skill: "", kind: "REQUIRED" }],
  };
}
