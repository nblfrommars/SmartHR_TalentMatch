import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button } from "../components/Form";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import Pagination from "../components/Pagination";
import { JOB_STATUS_LABELS, deadlineLabel, formatDate, formatSalary } from "../lib/format";
import { jobApi } from "../lib/jobApi";
import { useToast } from "../lib/toastContext";

const PAGE_SIZE = 10;
const TABS = [
  ["", "Tất cả"],
  ["OPEN", "Đang tuyển"],
  ["CLOSED", "Đã đóng"],
];

const ACTIONS = {
  close: {
    title: "Đóng tin tuyển dụng?",
    message: "Tin sẽ không còn hiển thị công khai và không nhận thêm hồ sơ. Không thể mở lại.",
    label: "Đóng tin",
    run: (id, getToken) => jobApi.close(id, getToken),
    done: "Đã đóng tin tuyển dụng.",
  },
  remove: {
    title: "Xóa tin tuyển dụng?",
    message: "Tin sẽ bị xóa vĩnh viễn. Các đơn đã nộp cho tin này vẫn còn bên phía ứng viên.",
    label: "Xóa tin",
    run: (id, getToken) => jobApi.remove(id, getToken),
    done: "Đã xóa tin tuyển dụng.",
  },
};

export default function HrJobs() {
  const { getToken } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: null, page: null });
  const [pending, setPending] = useState(null); // { kind, job }
  const [busy, setBusy] = useState(false);

  const status = params.get("status") || "";
  const page = Math.max(0, (parseInt(params.get("page") || "1", 10) || 1) - 1);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    jobApi
      .mine({ status, page, size: PAGE_SIZE, sort: "createdAt,desc" }, getToken)
      .then((data) => active && setState({ loading: false, error: null, page: data }))
      .catch((error) => active && setState({ loading: false, error, page: null }));
    return () => {
      active = false;
    };
  }, [status, page, getToken, reloadKey]);

  function go(next) {
    const query = new URLSearchParams();
    if (next.status ?? status) query.set("status", next.status ?? status);
    if (next.page) query.set("page", String(next.page + 1));
    setParams(query);
  }

  async function runAction() {
    const action = ACTIONS[pending.kind];
    setBusy(true);
    try {
      await action.run(pending.job.id, getToken);
      toast.success(action.done);
      setPending(null);
      load();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  const jobs = state.page?.content || [];
  const action = pending ? ACTIONS[pending.kind] : null;

  return (
    <AccountLayout
      title="Tin tuyển dụng của tôi"
      subtitle={state.page ? `${state.page.totalElements} tin` : undefined}
      actions={
        <Link to="/hr/jobs/new" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          + Đăng tin mới
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => go({ status: value, page: 0 })}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              status === value ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message="Không tải được danh sách tin." onRetry={load} />}
      {!state.loading && !state.error && jobs.length === 0 && (
        <Empty title="Chưa có tin tuyển dụng nào" hint="Bấm “Đăng tin mới” để bắt đầu tuyển dụng." />
      )}
      {!state.loading && jobs.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
            <ul className="divide-y divide-zinc-100">
              {jobs.map((job) => {
                const badge = JOB_STATUS_LABELS[job.status] || { label: job.status, tone: "neutral" };
                return (
                  <li key={job.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/jobs/${job.id}`} className="truncate font-bold text-zinc-900 hover:text-brand-600">
                          {job.title}
                        </Link>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        {job.companyName} · <span className="text-accent-600">{formatSalary(job.salaryMin, job.salaryMax)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Đăng {formatDate(job.publishedAt || job.createdAt)} · Hạn {formatDate(job.deadline)}
                        {job.status === "OPEN" && ` · ${deadlineLabel(job.deadline)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {job.status !== "CLOSED" && (
                        <Link
                          to={`/hr/jobs/${job.id}/edit`}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Sửa
                        </Link>
                      )}
                      {job.status === "OPEN" && (
                        <Button tone="secondary" size="sm" onClick={() => setPending({ kind: "close", job })}>
                          Đóng
                        </Button>
                      )}
                      <Button tone="danger" size="sm" onClick={() => setPending({ kind: "remove", job })}>
                        Xóa
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <Pagination page={state.page.number} totalPages={state.page.totalPages} onChange={(next) => go({ page: next })} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={action?.title}
        message={pending ? `“${pending.job.title}”. ${action.message}` : ""}
        confirmLabel={action?.label}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => setPending(null)}
      />
    </AccountLayout>
  );
}
