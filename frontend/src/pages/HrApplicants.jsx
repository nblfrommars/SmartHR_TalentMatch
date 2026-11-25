import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import Badge from "../components/Badge";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { ApiError } from "../lib/api";
import { APPLICATION_STATUS, applicationApi } from "../lib/applicationApi";
import { JOB_STATUS_LABELS, formatDateTime, shortId } from "../lib/format";
import { jobApi } from "../lib/jobApi";

const STATUS_FILTERS = [["", "Tất cả"], ...Object.entries(APPLICATION_STATUS).map(([value, s]) => [value, s.label])];

function loadErrorMessage(error) {
  if (error instanceof ApiError && error.status === 404) {
    return "Không tìm thấy tin tuyển dụng. Với tin đã đóng hoặc hết hạn, user-service hiện chưa lấy được danh sách ứng viên.";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "Bạn chỉ xem được ứng viên của tin do chính mình đăng.";
  }
  return "Không tải được danh sách ứng viên.";
}

function ApplicationRow({ application, highlighted }) {
  const [open, setOpen] = useState(highlighted);
  const status = APPLICATION_STATUS[application.status] || { label: application.status, tone: "neutral" };
  const letter = application.coverLetter?.trim();

  return (
    <li className={`p-4 ${highlighted ? "bg-brand-50/60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
            UV
          </span>
          <div>
            <p className="font-semibold text-zinc-900">
              Ứng viên <span className="font-mono text-sm">#{shortId(application.applicantId)}</span>
              {highlighted && <span className="ml-2 text-xs font-medium text-brand-700">Mới</span>}
            </p>
            <p className="text-xs text-zinc-500">Nộp lúc {formatDateTime(application.appliedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={application.cvAttachmentId ? "success" : "neutral"}>
            {application.cvAttachmentId ? "Có file CV" : "Không có file CV"}
          </Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>
      {letter ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm font-medium text-brand-600 hover:underline"
            aria-expanded={open}
          >
            {open ? "Ẩn thư giới thiệu" : "Xem thư giới thiệu"}
          </button>
          {open && (
            <p className="mt-2 whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700">
              {letter}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">Ứng viên không gửi thư giới thiệu.</p>
      )}
    </li>
  );
}

/** HR xem các đơn ứng tuyển vào một tin của mình. */
export default function HrApplicants() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get("highlight");
  const { getToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, job: null, applications: [] });
  const [filter, setFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([jobApi.get(id, getToken), applicationApi.forJob(id, getToken)])
      .then(([job, applications]) => active && setState({ loading: false, error: null, job, applications }))
      .catch((error) => active && setState({ loading: false, error, job: null, applications: [] }));
    return () => {
      active = false;
    };
  }, [id, getToken, reloadKey]);

  function reload() {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }

  const { job, applications } = state;
  const shown = filter ? applications.filter((a) => a.status === filter) : applications;
  const jobBadge = job ? JOB_STATUS_LABELS[job.status] || { label: job.status, tone: "neutral" } : null;

  return (
    <AccountLayout
      title="Ứng viên"
      subtitle={job ? `${applications.length} đơn ứng tuyển` : undefined}
      actions={
        <Link to="/hr/jobs" className="text-sm font-medium text-brand-600 hover:underline">
          ‹ Về danh sách tin
        </Link>
      }
    >
      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message={loadErrorMessage(state.error)} onRetry={reload} />}

      {!state.loading && job && (
        <>
          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/jobs/${job.id}`} className="text-lg font-bold text-zinc-900 hover:text-brand-600">
                {job.title}
              </Link>
              {jobBadge && <Badge tone={jobBadge.tone}>{jobBadge.label}</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-500">{job.companyName}</p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {STATUS_FILTERS.map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  filter === value ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <Empty
              title={applications.length === 0 ? "Chưa có ai ứng tuyển" : "Không có đơn ở trạng thái này"}
              hint={applications.length === 0 ? "Khi có ứng viên nộp đơn, bạn sẽ nhận được thông báo." : undefined}
            />
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
              {shown.map((application) => (
                <ApplicationRow
                  key={application.id}
                  application={application}
                  highlighted={application.id === highlight}
                />
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-zinc-400">
            Backend hiện chỉ trả mã ứng viên (chưa có tên, email), chưa cho HR mở file CV và chưa có API đổi trạng thái đơn.
          </p>
        </>
      )}
    </AccountLayout>
  );
}
