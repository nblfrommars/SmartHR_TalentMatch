import { useState } from "react";
import { ApiError } from "../lib/api";
import { JOB_TYPE_LABELS, LEVEL_LABELS, WORK_MODE_LABELS, fromDateTimeLocal, toTree } from "../lib/format";
import { SKILL_KINDS } from "../lib/jobFormModel";
import { inputClass } from "../lib/ui";
import { Button, Card, Field } from "./Form";
import TreeSelect from "./TreeSelect";

/**
 * Bỏ "Thực tập" khỏi lựa chọn loại hình (yêu cầu của nhóm; cấp bậc "Thực tập sinh" vẫn giữ).
 * Tin cũ đang là INTERNSHIP thì vẫn hiện để sửa không bị mất giá trị.
 */
function jobTypeOptions(current) {
  return Object.fromEntries(
    Object.entries(JOB_TYPE_LABELS).filter(([value]) => value !== "INTERNSHIP" || value === current),
  );
}

const toVnd = (million) => (million === "" ? null : Math.round(Number(million) * 1_000_000));

/** Kiểm tra phía client, khớp với ràng buộc của JobReq ở job-service. */
function validate(form) {
  const errors = {};
  const required = ["companyName", "title", "description", "level", "jobType", "workMode", "industryId", "locationId", "deadline"];
  required.forEach((key) => {
    if (!String(form[key]).trim()) errors[key] = "Không được để trống";
  });
  if (form.title.length > 255) errors.title = "Tối đa 255 ký tự";
  if (form.companyName.length > 255) errors.companyName = "Tối đa 255 ký tự";
  ["salaryMin", "salaryMax"].forEach((key) => {
    if (form[key] !== "" && !(Number(form[key]) > 0)) errors[key] = "Phải là số dương";
  });
  if (!errors.salaryMin && !errors.salaryMax && form.salaryMin !== "" && form.salaryMax !== ""
      && Number(form.salaryMin) > Number(form.salaryMax)) {
    errors.salaryMax = "Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu";
  }
  if (form.minYearsExp !== "" && !(Number.isInteger(Number(form.minYearsExp)) && Number(form.minYearsExp) >= 0)) {
    errors.minYearsExp = "Số nguyên không âm";
  }
  if (form.deadline && Date.parse(form.deadline) <= Date.now()) errors.deadline = "Hạn nộp phải ở tương lai";
  const skills = form.skills.filter((s) => s.skill.trim());
  if (skills.length === 0) errors.skills = "Cần ít nhất một kỹ năng";
  if (skills.length > 50) errors.skills = "Tối đa 50 kỹ năng";
  if (skills.some((s) => s.skill.trim().length > 50)) errors.skills = "Tên kỹ năng tối đa 50 ký tự";
  return errors;
}

function toBody(form) {
  return {
    companyName: form.companyName.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    level: form.level,
    jobType: form.jobType,
    workMode: form.workMode,
    industryId: form.industryId,
    locationId: form.locationId,
    salaryMin: toVnd(form.salaryMin),
    salaryMax: toVnd(form.salaryMax),
    minYearsExp: form.minYearsExp === "" ? null : Number(form.minYearsExp),
    deadline: fromDateTimeLocal(form.deadline),
    skills: form.skills
      .filter((s) => s.skill.trim())
      .map((s) => ({
        skill: s.skill.trim(),
        mustHave: SKILL_KINDS[s.kind].mustHave,
        required: SKILL_KINDS[s.kind].required,
      })),
  };
}

/** Lỗi theo trường từ backend (details[].field) -> tên trường của form. */
function serverFieldErrors(error) {
  if (!(error instanceof ApiError)) return {};
  const mapped = {};
  Object.entries(error.fieldErrors()).forEach(([field, message]) => {
    if (field === "salaryRangeValid") mapped.salaryMax = message;
    else if (field.startsWith("skills")) mapped.skills = message;
    else mapped[field] = message;
  });
  return mapped;
}

export default function JobForm({ initial, industries, locations, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const setValue = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const updateSkill = (index, patch) =>
    setForm((f) => ({ ...f, skills: f.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  async function submit(event) {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSubmit(toBody(form));
    } catch (error) {
      setErrors(serverFieldErrors(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  const input = (key, props = {}) => (
    <input id={`job-${key}`} value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} className={inputClass} {...props} />
  );
  const select = (key, labels, placeholder) => (
    <select id={`job-${key}`} value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} className={inputClass}>
      <option value="">{placeholder}</option>
      {Object.entries(labels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );

  return (
    <form onSubmit={(e) => submit(e).catch(() => {})} noValidate className="space-y-6">
      <Card title="Thông tin chung">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên công ty" htmlFor="job-companyName" required error={errors.companyName}>
            {input("companyName", { maxLength: 255, placeholder: "Ví dụ: Công ty ABC" })}
          </Field>
          <Field label="Chức danh" htmlFor="job-title" required error={errors.title}>
            {input("title", { maxLength: 255, placeholder: "Ví dụ: Senior Java Developer" })}
          </Field>
          <Field label="Cấp bậc" htmlFor="job-level" required error={errors.level}>
            {select("level", LEVEL_LABELS, "Chọn cấp bậc")}
          </Field>
          <Field label="Loại hình" htmlFor="job-jobType" required error={errors.jobType}>
            {select("jobType", jobTypeOptions(form.jobType), "Chọn loại hình")}
          </Field>
          <Field label="Hình thức làm việc" htmlFor="job-workMode" required error={errors.workMode}>
            {select("workMode", WORK_MODE_LABELS, "Chọn hình thức")}
          </Field>
          <Field label="Hạn nộp hồ sơ" htmlFor="job-deadline" required error={errors.deadline}>
            {input("deadline", { type: "datetime-local" })}
          </Field>
          <Field label="Ngành nghề" htmlFor="job-industryId" required error={errors.industryId}>
            <TreeSelect
              id="job-industryId"
              value={form.industryId}
              onChange={setValue("industryId")}
              tree={toTree(industries)}
              placeholder="Chọn ngành nghề"
              invalid={Boolean(errors.industryId)}
              className={inputClass}
            />
          </Field>
          <Field label="Địa điểm" htmlFor="job-locationId" required error={errors.locationId}>
            <TreeSelect
              id="job-locationId"
              value={form.locationId}
              onChange={setValue("locationId")}
              tree={toTree(locations)}
              placeholder="Chọn địa điểm"
              invalid={Boolean(errors.locationId)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card title="Lương và kinh nghiệm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Lương tối thiểu (triệu)" htmlFor="job-salaryMin" error={errors.salaryMin} hint="Bỏ trống nếu thương lượng">
            {input("salaryMin", { type: "number", min: 0, step: 0.5 })}
          </Field>
          <Field label="Lương tối đa (triệu)" htmlFor="job-salaryMax" error={errors.salaryMax}>
            {input("salaryMax", { type: "number", min: 0, step: 0.5 })}
          </Field>
          <Field label="Kinh nghiệm tối thiểu (năm)" htmlFor="job-minYearsExp" error={errors.minYearsExp}>
            {input("minYearsExp", { type: "number", min: 0, step: 1 })}
          </Field>
        </div>
      </Card>

      <Card title="Mô tả công việc">
        <Field htmlFor="job-description" required error={errors.description}>
          <textarea
            id="job-description"
            rows={8}
            value={form.description}
            onChange={set("description")}
            aria-invalid={Boolean(errors.description)}
            placeholder="Mô tả công việc, quyền lợi, yêu cầu..."
            className={inputClass}
          />
        </Field>
      </Card>

      <Card
        title="Kỹ năng"
        actions={
          <Button
            tone="secondary"
            size="sm"
            onClick={() => setForm((f) => ({ ...f, skills: [...f.skills, { skill: "", kind: "REQUIRED" }] }))}
          >
            + Thêm kỹ năng
          </Button>
        }
      >
        <div className="space-y-2">
          {form.skills.map((skill, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={skill.skill}
                onChange={(e) => updateSkill(index, { skill: e.target.value })}
                maxLength={50}
                placeholder="Ví dụ: Java"
                aria-label={`Kỹ năng ${index + 1}`}
                className={inputClass}
              />
              <select
                value={skill.kind}
                onChange={(e) => updateSkill(index, { kind: e.target.value })}
                aria-label={`Mức độ kỹ năng ${index + 1}`}
                className={`${inputClass} sm:w-48`}
              >
                {Object.entries(SKILL_KINDS).map(([value, kind]) => (
                  <option key={value} value={value}>
                    {kind.label}
                  </option>
                ))}
              </select>
              <Button
                tone="ghost"
                onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, i) => i !== index) }))}
                disabled={form.skills.length === 1}
                aria-label={`Xóa kỹ năng ${index + 1}`}
              >
                Xóa
              </Button>
            </div>
          ))}
        </div>
        {errors.skills && <p className="mt-2 text-xs text-red-600">{errors.skills}</p>}
        <p className="mt-3 text-xs text-zinc-500">
          "Bắt buộc phải có": thiếu kỹ năng này coi như không phù hợp. "Điểm cộng": không bắt buộc.
        </p>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
        )}
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
