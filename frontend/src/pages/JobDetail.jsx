import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button, ButtonLink, Card, Field } from "../components/Form";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import PublicLayout from "../components/PublicLayout";
import { ApiError } from "../lib/api";
import { APPLICATION_STATUS, applicationApi } from "../lib/applicationApi";
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  LEVEL_LABELS,
  WORK_MODE_LABELS,
  buildLabel,
  daysLeft,
  deadlineLabel,
  formatDate,
  formatDateTime,
  formatSalary,
} from "../lib/format";
import { isNotFound, jobApi } from "../lib/jobApi";
import { useToast } from "../lib/toastContext";
import { inputClass } from "../lib/ui";
import { useReferenceData } from "../lib/useReferenceData";
import { userApi } from "../lib/userApi";

function skillBadge(entry) {
  if (entry.mustHave) return <Badge tone="danger">Bắt buộc</Badge>;
  if (entry.required !== false) return <Badge tone="brand">Yêu cầu</Badge>;
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

function applyErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Bạn đã ứng tuyển tin này, hoặc tin không còn nhận hồ sơ.";
    if (error.status === 403) return "Chỉ tài khoản ứng viên đang hoạt động mới được ứng tuyển.";
    if (error.status === 400) return "Cần có file CV: tải lên ở đây hoặc thêm vào Hồ sơ CV.";
  }
  return null;
}

/** Khối ứng tuyển cho ứng viên (role USER). */
function ApplyPanel({ job }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, existing: null, profileCvId: null });
  const [source, setSource] = useState("profile");
  const [file, setFile] = useState(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([applicationApi.mine(getToken), userApi.getCv(getToken)]).then(([apps, cv]) => {
      if (!active) return;
      const existing = apps.status === "fulfilled" ? apps.value.find((a) => a.jobId === job.id) || null : null;
      const profileCvId = cv.status === "fulfilled" ? cv.value?.cvAttachmentId || null : null;
      setState({ loading: false, existing, profileCvId });
      if (!profileCvId) setSource("upload");
    });
    return () => {
      active = false;
    };
  }, [job.id, getToken]);

  async function submit(event) {
    event.preventDefault();
    if (source === "upload" && !file) {
      toast.error("Hãy chọn file CV để gửi kèm.");
      return;
    }
    setBusy(true);
    try {
      let cvAttachmentId;
      if (source === "upload") {
        const uploaded = await userApi.upload(file, getToken);
        cvAttachmentId = uploaded.id;
      }
      const created = await applicationApi.apply(
        job.id,
        { coverLetter: coverLetter.trim() || null, cvAttachmentId },
        getToken,
      );
      setState((s) => ({ ...s, existing: created }));
      toast.success("Ứng tuyển thành công!");
    } catch (error) {
      toast.error(applyErrorMessage(error) || error);
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <Loading label="Đang kiểm tra hồ sơ..." />;

  if (state.existing) {
    const status = APPLICATION_STATUS[state.existing.status] || { label: state.existing.status, tone: "neutral" };
    return (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-700">
          Bạn đã ứng tuyển lúc <strong>{formatDateTime(state.existing.appliedAt)}</strong>.
        </p>
        <Badge tone={status.tone}>{status.label}</Badge>
        <Link to="/me/applications" className="block font-semibold text-brand-600 hover:underline">
          Xem các đơn đã nộp
        </Link>
      </div>
    );
  }

  const expired = (daysLeft(job.deadline) ?? 0) < 0;
  if (job.status !== "OPEN" || expired) {
    return <p className="text-sm text-zinc-600">Tin tuyển dụng này không còn nhận hồ sơ.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium text-zinc-700">File CV gửi kèm</legend>
        <label className={`flex items-center gap-2 ${state.profileCvId ? "" : "opacity-50"}`}>
          <input
            type="radio"
            name="cv-source"
            checked={source === "profile"}
            disabled={!state.profileCvId}
            onChange={() => setSource("profile")}
          />
          Dùng CV trong hồ sơ
          {!state.profileCvId && <span className="text-xs text-zinc-500">(chưa có)</span>}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="cv-source" checked={source === "upload"} onChange={() => setSource("upload")} />
          Tải file khác
        </label>
        {source === "upload" && (
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700"
          />
        )}
      </fieldset>
      <Field label="Thư giới thiệu" htmlFor="cover-letter" hint={`${coverLetter.length}/10000 ký tự`}>
        <textarea
          id="cover-letter"
          rows={5}
          maxLength={10000}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          placeholder="Giới thiệu ngắn về bản thân và lý do phù hợp với vị trí..."
          className={inputClass}
        />
      </Field>
      <Button type="submit" busy={busy} className="w-full">
        Ứng tuyển ngay
      </Button>
      <Link to="/me/cv" className="block text-center text-xs text-zinc-500 hover:text-brand-600">
        Cập nhật Hồ sơ CV
      </Link>
    </form>
  );
}

/** Thao tác của HR là chủ tin. */
function OwnerPanel({ job, onClosed }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function close() {
    setBusy(true);
    try {
      await jobApi.close(job.id, getToken);
      toast.success("Đã đóng tin tuyển dụng.");
      setConfirm(false);
      onClosed();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600">Đây là tin tuyển dụng của bạn.</p>
      <div className="flex flex-wrap items-center gap-2">
        {job.status !== "CLOSED" && <ButtonLink to={`/hr/jobs/${job.id}/edit`}>Sửa tin</ButtonLink>}
        {job.status === "OPEN" && (
          <Button tone="danger" onClick={() => setConfirm(true)}>
            Đóng tin
          </Button>
        )}
        <ButtonLink to={`/hr/jobs/${job.id}/applicants`} tone="secondary">
          Xem ứng viên
        </ButtonLink>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Đóng tin tuyển dụng?"
        message="Tin sẽ không còn hiển thị công khai và không nhận thêm hồ sơ. Không thể mở lại."
        confirmLabel="Đóng tin"
        busy={busy}
        onConfirm={close}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

function ActionPanel({ job, onChanged }) {
  const { ready, authenticated, user, hasRole, login } = useAuth();

  if (!ready) return <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />;

  if (!authenticated) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600">Đăng nhập bằng tài khoản ứng viên để ứng tuyển.</p>
        <Button onClick={() => login()} className="w-full">
          Đăng nhập để ứng tuyển
        </Button>
        <p className="text-center text-zinc-500">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline">
            Đăng ký
          </Link>
        </p>
      </div>
    );
  }

  if (hasRole("HR") && user?.id === job.createdBy) return <OwnerPanel job={job} onClosed={onChanged} />;
  if (hasRole("USER")) return <ApplyPanel job={job} />;
  return <p className="text-sm text-zinc-600">Chỉ tài khoản ứng viên mới ứng tuyển được.</p>;
}

export default function JobDetail() {
  const { id } = useParams();
  const { ready, authenticated, getToken } = useAuth();
  const { industries, locations } = useReferenceData();
  const [state, setState] = useState({ loading: true, error: null, job: null });
  const [attempt, setAttempt] = useState(0);
  const withToken = ready && authenticated;

  useEffect(() => {
    let active = true;
    // Gửi token khi đã đăng nhập: chủ tin xem được cả tin đã đóng/hết hạn
    jobApi
      .get(id, withToken ? getToken : undefined)
      .then((job) => active && setState({ loading: false, error: null, job }))
      .catch((error) => active && setState({ loading: false, error, job: null }));
    return () => {
      active = false;
    };
  }, [id, attempt, withToken, getToken]);

  const reload = () => setAttempt((n) => n + 1);
  const { job } = state;
  const days = job ? daysLeft(job.deadline) : null;
  const status = job ? JOB_STATUS_LABELS[job.status] : null;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/jobs" className="text-sm font-medium text-brand-600 hover:underline">
          ‹ Quay lại danh sách việc làm
        </Link>

        <div className="mt-4">
          {state.loading && <Loading />}
          {!state.loading && state.error && isNotFound(state.error) && (
            <Empty title="Tin tuyển dụng không tồn tại hoặc đã đóng" hint="Bạn có thể xem các việc làm khác đang tuyển." />
          )}
          {!state.loading && state.error && !isNotFound(state.error) && (
            <ErrorBox message="Không tải được tin tuyển dụng." onRetry={reload} />
          )}

          {job && (
            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-6">
                <Card>
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
                    {status && job.status !== "OPEN" && <Badge tone={status.tone}>{status.label}</Badge>}
                  </div>
                </Card>

                <Card title="Mô tả công việc">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{job.description}</p>
                </Card>

                {job.skills?.length > 0 && (
                  <Card title="Kỹ năng">
                    <ul className="flex flex-wrap gap-3">
                      {job.skills.map((entry) => (
                        <li key={entry.skill} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                          <span className="font-medium text-zinc-800">{entry.skill}</span>
                          {skillBadge(entry)}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>

              <aside className="space-y-6">
                <Card title="Ứng tuyển">
                  <ActionPanel job={job} onChanged={reload} />
                </Card>
                <Card title="Thông tin chung">
                  <dl className="divide-y divide-zinc-100">
                    <InfoRow label="Cấp bậc" value={LEVEL_LABELS[job.level] || job.level} />
                    <InfoRow label="Loại hình" value={JOB_TYPE_LABELS[job.jobType] || job.jobType} />
                    <InfoRow label="Hình thức" value={WORK_MODE_LABELS[job.workMode] || job.workMode} />
                    <InfoRow
                      label="Kinh nghiệm tối thiểu"
                      value={typeof job.minYearsExp === "number" ? `${job.minYearsExp} năm` : ""}
                    />
                    <InfoRow label="Ngành nghề" value={buildLabel(job.industry, industries)} />
                    <InfoRow label="Địa điểm" value={buildLabel(job.location, locations)} />
                    <InfoRow label="Ngày đăng" value={formatDate(job.publishedAt)} />
                    <InfoRow label="Hạn nộp" value={formatDate(job.deadline)} />
                  </dl>
                </Card>
              </aside>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
