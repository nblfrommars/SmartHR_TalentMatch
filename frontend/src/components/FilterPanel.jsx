import { useState } from "react";
import { LEVEL_LABELS, toTree } from "../lib/format";
import TreeSelect from "./TreeSelect";

const SALARY_OPTIONS = [
  { value: "", label: "Tất cả mức lương" },
  { value: "10000000", label: "Từ 10 triệu" },
  { value: "20000000", label: "Từ 20 triệu" },
  { value: "30000000", label: "Từ 30 triệu" },
  { value: "50000000", label: "Từ 50 triệu" },
];

const fieldClass =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-brand-500";

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function FilterPanel({ values, industries = [], locations = [], onChange, onReset }) {
  const [company, setCompany] = useState(values.companyName || "");

  function applyCompany(event) {
    event.preventDefault();
    onChange({ companyName: company.trim() });
  }

  return (
    <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-900">Bộ lọc</h2>
        <button
          type="button"
          onClick={() => {
            setCompany("");
            onReset();
          }}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Xóa bộ lọc
        </button>
      </div>

      <Field label="Ngành nghề" htmlFor="f-industry">
        <TreeSelect
          id="f-industry"
          value={values.industryId || ""}
          onChange={(industryId) => onChange({ industryId })}
          tree={toTree(industries)}
          placeholder="Tất cả ngành nghề"
          className={fieldClass}
        />
      </Field>

      <Field label="Địa điểm" htmlFor="f-location">
        <TreeSelect
          id="f-location"
          value={values.locationId || ""}
          onChange={(locationId) => onChange({ locationId })}
          tree={toTree(locations)}
          placeholder="Tất cả địa điểm"
          className={fieldClass}
        />
      </Field>

      <Field label="Cấp bậc" htmlFor="f-level">
        <select
          id="f-level"
          value={values.level || ""}
          onChange={(event) => onChange({ level: event.target.value })}
          className={fieldClass}
        >
          <option value="">Tất cả cấp bậc</option>
          {Object.entries(LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mức lương" htmlFor="f-salary">
        <select
          id="f-salary"
          value={values.salaryMin || ""}
          onChange={(event) => onChange({ salaryMin: event.target.value })}
          className={fieldClass}
        >
          {SALARY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <form onSubmit={applyCompany}>
        <Field label="Tên công ty" htmlFor="f-company">
          <div className="flex gap-2">
            <input
              id="f-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Nhập tên công ty"
              className={fieldClass}
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Lọc
            </button>
          </div>
        </Field>
      </form>
    </div>
  );
}
