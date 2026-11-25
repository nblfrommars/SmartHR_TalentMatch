import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import Badge from "../components/Badge";
import { Card } from "../components/Form";
import { ErrorBox, Loading } from "../components/PageState";
import { ApiError } from "../lib/api";
import { APPLICATION_STATUS, applicationApi } from "../lib/applicationApi";
import { formatDateTime } from "../lib/format";
import { useJobsById } from "../lib/useJobsById";
import { userApi } from "../lib/userApi";

// Các mục dùng để tính độ hoàn thiện hồ sơ
const CV_PARTS = [
  ["positionId", "Vị trí mong muốn"],
  ["workLocationId", "Địa điểm làm việc"],
  ["eduLevel", "Trình độ học vấn"],
  ["summary", "Giới thiệu bản thân"],
  ["cvAttachmentId", "File CV"],
  ["skills", "Kỹ năng"],
];

function completeness(cv) {
  if (!cv) return { percent: 0, missing: CV_PARTS.map(([, label]) => label) };
  const missing = CV_PARTS.filter(([key]) => {
    const value = cv[key];
    return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || value === "";
  }).map(([, label]) => label);
  return { percent: Math.round(((CV_PARTS.length - missing.length) / CV_PARTS.length) * 100), missing };
}

function Stat({ label, value, to }) {
  const body = (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card transition hover:border-brand-200">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-zinc-900">{value}</p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function MyDashboard() {
  const { getToken, user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, cv: null, applications: [] });
  const [attempt, setAttempt] = useState(0);
  const jobs = useJobsById(state.applications.slice(0, 5).map((a) => a.jobId));

  useEffect(() => {
    let active = true;
    Promise.allSettled([userApi.getCv(getToken), applicationApi.mine(getToken)]).then(([cv, apps]) => {
      if (!active) return;
      const cvMissing = cv.status === "rejected" && cv.reason instanceof ApiError && cv.reason.status === 404;
      if ((cv.status === "rejected" && !cvMissing) || apps.status === "rejected") {
        setState({ loading: false, error: cv.reason || apps.reason, cv: null, applications: [] });
        return;
      }
      setState({ loading: false, error: null, cv: cvMissing ? null : cv.value, applications: apps.value });
    });
    return () => {
      active = false;
    };
  }, [getToken, attempt]);

  const { percent, missing } = completeness(state.cv);
  const count = (statuses) => state.applications.filter((a) => statuses.includes(a.status)).length;

  return (
    <AccountLayout title={`Xin chào, ${user?.name || "bạn"}`} subtitle="Tổng quan hồ sơ và hành trình ứng tuyển của bạn.">
      {state.loading && <Loading />}
      {!state.loading && state.error && (
        <ErrorBox message="Không tải được dữ liệu tổng quan." onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {!state.loading && !state.error && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Đơn đã nộp" value={state.applications.length} to="/me/applications" />
            <Stat label="Đang được xem xét" value={count(["APPLIED", "REVIEWING", "SHORTLISTED"])} to="/me/applications" />
            <Stat label="Độ hoàn thiện hồ sơ" value={`${percent}%`} to="/me/cv" />
          </div>

          <Card title="Hồ sơ CV" actions={<Link to="/me/cv" className="text-sm font-semibold text-brand-600 hover:underline">Cập nhật</Link>}>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
            {missing.length > 0 ? (
              <p className="mt-3 text-sm text-zinc-600">Còn thiếu: {missing.join(", ")}.</p>
            ) : (
              <p className="mt-3 text-sm text-emerald-700">Hồ sơ đã đầy đủ thông tin.</p>
            )}
          </Card>

          <Card
            title="Đơn ứng tuyển gần đây"
            actions={<Link to="/me/applications" className="text-sm font-semibold text-brand-600 hover:underline">Xem tất cả</Link>}
          >
            {state.applications.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Bạn chưa ứng tuyển việc nào.{" "}
                <Link to="/jobs" className="font-semibold text-brand-600 hover:underline">
                  Tìm việc ngay
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {state.applications.slice(0, 5).map((application) => {
                  const job = jobs[application.jobId];
                  const status = APPLICATION_STATUS[application.status] || { label: application.status, tone: "neutral" };
                  return (
                    <li key={application.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900">
                          {job === undefined ? "..." : job ? job.title : "Tin tuyển dụng đã đóng"}
                        </p>
                        <p className="text-xs text-zinc-500">{formatDateTime(application.appliedAt)}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AccountLayout>
  );
}
