import { Link } from "react-router-dom";
import Badge from "./Badge";
import {
  LEVEL_LABELS,
  WORK_MODE_LABELS,
  buildLabel,
  daysLeft,
  deadlineLabel,
  formatSalary,
} from "../lib/format";
import { isPublicSkill } from "../lib/jobFormModel";

export default function JobCard({ job, locations = [] }) {
  const days = daysLeft(job.deadline);
  // Thẻ tin là giao diện công khai: không hiện kỹ năng "Điểm cộng" (tiêu chí ngầm của HR)
  const skills = (job.skills || []).filter(isPublicSkill).slice(0, 3);

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="group flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
    >
      <h3 className="line-clamp-2 text-base font-bold text-zinc-900 group-hover:text-brand-600">{job.title}</h3>
      <p className="mt-1 truncate text-sm text-zinc-600">{job.companyName}</p>
      <p className="mt-3 text-sm font-bold text-accent-600">{formatSalary(job.salaryMin, job.salaryMax)}</p>
      <p className="mt-1 truncate text-sm text-zinc-500">{buildLabel(job.location, locations)}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.level && <Badge tone="brand">{LEVEL_LABELS[job.level] || job.level}</Badge>}
        {job.workMode && <Badge>{WORK_MODE_LABELS[job.workMode] || job.workMode}</Badge>}
        {skills.map((entry) => (
          <Badge key={entry.skill}>{entry.skill}</Badge>
        ))}
      </div>

      <p className={`mt-auto pt-4 text-xs ${days !== null && days <= 3 ? "font-medium text-red-600" : "text-zinc-400"}`}>
        {deadlineLabel(job.deadline)}
      </p>
    </Link>
  );
}
