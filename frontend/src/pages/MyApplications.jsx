import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button } from "../components/Form";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { APPLICATION_STATUS, WITHDRAWABLE, applicationApi } from "../lib/applicationApi";
import { formatDateTime, formatSalary } from "../lib/format";
import { useJobsById } from "../lib/useJobsById";
import { useToast } from "../lib/toastContext";

const FILTERS = [["", "Tất cả"], ...Object.entries(APPLICATION_STATUS).map(([k, v]) => [k, v.label])];

function ApplicationCard({ application, job, onWithdraw }) {
  const [open, setOpen] = useState(false);
  const status = APPLICATION_STATUS[application.status] || { label: application.status, tone: "neutral" };
  const loadingJob = job === undefined;

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {loadingJob && <div className="h-5 w-48 animate-pulse rounded bg-zinc-100" />}
          {!loadingJob && job && (
            <>
              <Link to={`/jobs/${job.id}`} className="font-bold text-zinc-900 hover:text-brand-600">
                {job.title}
              </Link>
              <p className="text-sm text-zinc-600">
                {job.companyName} · <span className="text-accent-600">{formatSalary(job.salaryMin, job.salaryMax)}</span>
              </p>
            </>
          )}
          {!loadingJob && !job && (
            <>
              <p className="font-bold text-zinc-500">Tin tuyển dụng đã đóng</p>
              <p className="text-xs text-zinc-400">Mã tin: {application.jobId}</p>
            </>
          )}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
        <span>Nộp lúc {formatDateTime(application.appliedAt)}</span>
        <div className="flex gap-2">
          {application.coverLetter && (
            <Button tone="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Ẩn thư giới thiệu" : "Xem thư giới thiệu"}
            </Button>
          )}
          {WITHDRAWABLE.includes(application.status) && (
            <Button tone="danger" size="sm" onClick={() => onWithdraw(application)}>
              Rút đơn
            </Button>
          )}
        </div>
      </div>
      {open && <p className="mt-3 whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{application.coverLetter}</p>}
    </article>
  );
}

export default function MyApplications() {
  const { getToken } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const jobs = useJobsById(state.items.map((a) => a.jobId));

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    applicationApi
      .mine(getToken)
      .then((items) => active && setState({ loading: false, error: null, items }))
      .catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => {
      active = false;
    };
  }, [getToken, reloadKey]);

  async function withdraw() {
    setBusy(true);
    try {
      await applicationApi.withdraw(pending.id, getToken);
      toast.success("Đã rút đơn ứng tuyển.");
      setPending(null);
      load();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const items = filter ? state.items.filter((a) => a.status === filter) : state.items;

  return (
    <AccountLayout title="Đơn ứng tuyển" subtitle="Theo dõi trạng thái các hồ sơ bạn đã nộp.">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
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

      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message="Không tải được danh sách đơn." onRetry={load} />}
      {!state.loading && !state.error && items.length === 0 && (
        <Empty
          title={filter ? "Không có đơn nào ở trạng thái này" : "Bạn chưa ứng tuyển việc nào"}
          hint={filter ? undefined : "Tìm việc phù hợp và ứng tuyển ngay."}
        />
      )}
      {!state.loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              job={jobs[application.jobId]}
              onWithdraw={setPending}
            />
          ))}
        </div>
      )}
      {!state.loading && !filter && state.items.length === 0 && !state.error && (
        <div className="mt-4 text-center">
          <Link to="/jobs" className="font-semibold text-brand-600 hover:underline">
            Tìm việc làm
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Rút đơn ứng tuyển?"
        message="Nhà tuyển dụng sẽ không xem xét đơn này nữa. Bạn không thể ứng tuyển lại tin này."
        confirmLabel="Rút đơn"
        busy={busy}
        onConfirm={withdraw}
        onCancel={() => setPending(null)}
      />
    </AccountLayout>
  );
}
