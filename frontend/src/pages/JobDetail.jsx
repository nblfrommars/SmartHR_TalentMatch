import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Badge from "../components/Badge";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import PublicLayout from "../components/PublicLayout";
import {
  JOB_TYPE_LABELS,
  LEVEL_LABELS,
  WORK_MODE_LABELS,
  buildLabel,
  daysLeft,
  deadlineLabel,
  formatDate,
  formatSalary,
} from "../lib/format";
import { isNotFound, jobApi } from "../lib/jobApi";
import { useReferenceData } from "../lib/useReferenceData";

function skillBadge(entry) {
  if (entry.mustHave) return <Badge tone="danger">Bắt buộc</Badge>;
  if (entry.required) return <Badge tone="brand">Yêu cầu</Badge>;
  return <Badge>Điểm cộng</Badge>;
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { industries, locations } = useReferenceData();
  const [state, setState] = useState({ loading: true, error: null, job: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    jobApi
      .get(id)
      .then((job) => active && setState({ loading: false, error: null, job }))
      .catch((error) => active && setState({ loading: false, error, job: null }));
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const { job } = state;
  const days = job ? daysLeft(job.deadline) : null;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/jobs" className="text-sm font-medium text-brand-600 hover:underline">
          ‹ Quay lại danh sách việc làm
        </Link>

        <div className="mt-4">
          {state.loading && <Loading />}
          {!state.loading && state.error && isNotFound(state.error) && (
            <Empty
              title="Tin tuyển dụng không tồn tại hoặc đã đóng"
              hint="Bạn có thể xem các việc làm khác đang tuyển."
            />
          )}
          {!state.loading && state.error && !isNotFound(state.error) && (
            <ErrorBox
              message="Không tải được tin tuyển dụng."
              onRetry={() => {
                setState({ loading: true, error: null, job: null });
                setAttempt((n) => n + 1);
              }}
            />
          )}

          {job && (
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-6">
                <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-card">
                  <h1 className="text-2xl font-extrabold text-zinc-900">{job.title}</h1>
                  <p className="mt-1 text-base text-zinc-600">{job.companyName}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="text-lg font-bold text-accent-600">{formatSalary(job.salaryMin, job.salaryMax)}</span>
                    <span className="text-zinc-600">{buildLabel(job.location, locations)}</span>
                    <span className={days !== null && days <= 3 ? "font-medium text-red-600" : "text-zinc-500"}>
                      {deadlineLabel(job.deadline)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.level && <Badge tone="brand">{LEVEL_LABELS[job.level] || job.level}</Badge>}
                    {job.jobType && <Badge>{JOB_TYPE_LABELS[job.jobType] || job.jobType}</Badge>}
                    {job.workMode && <Badge>{WORK_MODE_LABELS[job.workMode] || job.workMode}</Badge>}
                    {job.status === "CLOSED" && <Badge tone="danger">Đã đóng</Badge>}
                  </div>
                </section>

                <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-card">
                  <h2 className="text-lg font-bold text-zinc-900">Mô tả công việc</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{job.description}</p>
                </section>

                {job.skills?.length > 0 && (
                  <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-card">
                    <h2 className="text-lg font-bold text-zinc-900">Kỹ năng</h2>
                    <ul className="mt-3 flex flex-wrap gap-3">
                      {job.skills.map((entry) => (
                        <li
                          key={entry.skill}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-zinc-800">{entry.skill}</span>
                          {skillBadge(entry)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-6 shadow-card">
                <h2 className="text-lg font-bold text-zinc-900">Thông tin chung</h2>
                <dl className="mt-2 divide-y divide-zinc-100">
                  <InfoRow label="Cấp bậc" value={LEVEL_LABELS[job.level] || job.level} />
                  <InfoRow label="Loại hình" value={JOB_TYPE_LABELS[job.jobType] || job.jobType} />
                  <InfoRow label="Hình thức làm việc" value={WORK_MODE_LABELS[job.workMode] || job.workMode} />
                  <InfoRow
                    label="Kinh nghiệm tối thiểu"
                    value={typeof job.minYearsExp === "number" ? `${job.minYearsExp} năm` : ""}
                  />
                  <InfoRow label="Ngành nghề" value={buildLabel(job.industry, industries)} />
                  <InfoRow label="Địa điểm" value={buildLabel(job.location, locations)} />
                  <InfoRow label="Ngày đăng" value={formatDate(job.publishedAt)} />
                  <InfoRow label="Hạn nộp hồ sơ" value={formatDate(job.deadline)} />
                </dl>
              </aside>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
