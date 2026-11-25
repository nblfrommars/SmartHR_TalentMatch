import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button, Card, Field } from "../components/Form";
import { ErrorBox, Loading } from "../components/PageState";
import { ApiError } from "../lib/api";
import { EDU_LEVELS, formatFileSize } from "../lib/format";
import { useToast } from "../lib/toastContext";
import { inputClass } from "../lib/ui";
import { userApi } from "../lib/userApi";

const EMPTY = {
  positionId: "",
  workLocationId: "",
  eduLevel: "",
  education: "",
  summary: "",
  imageAttachmentId: null,
  cvAttachmentId: null,
  skills: [],
};

function cvToForm(cv) {
  if (!cv) return EMPTY;
  return {
    positionId: cv.positionId != null ? String(cv.positionId) : "",
    workLocationId: cv.workLocationId != null ? String(cv.workLocationId) : "",
    eduLevel: cv.eduLevel != null ? String(cv.eduLevel) : "",
    education: cv.education || "",
    summary: cv.summary || "",
    imageAttachmentId: cv.imageAttachmentId || null,
    cvAttachmentId: cv.cvAttachmentId || null,
    skills: (cv.skills || []).map((s) => ({ skillId: s.skillId ?? null, skill: s.skill || "", years: String(s.yearsOfExperience ?? 0) })),
  };
}

function toBody(form) {
  return {
    positionId: form.positionId ? Number(form.positionId) : null,
    // Gửi giá trị thô như frontend hiện tại của user-cv (backend đang nhận Long)
    workLocationId: form.workLocationId || null,
    eduLevel: form.eduLevel === "" ? null : Number(form.eduLevel),
    education: form.education.trim() || null,
    summary: form.summary.trim() || null,
    imageAttachmentId: form.imageAttachmentId,
    cvAttachmentId: form.cvAttachmentId,
    skills: form.skills
      .filter((s) => s.skill.trim())
      .map((s) => ({
        ...(s.skillId ? { skillId: s.skillId } : {}),
        skill: s.skill.trim(),
        yearsOfExperience: Math.max(0, parseInt(s.years || "0", 10) || 0),
      })),
  };
}

/**
 * Backend nhận cả hồ sơ rỗng, nên frontend tự yêu cầu các mục tối thiểu để hồ sơ có ý nghĩa
 * khi nhà tuyển dụng xem và khi AI gợi ý việc làm.
 */
function validateCv(form, catalog) {
  const errors = {};
  if (catalog.positions.length > 0 && !form.positionId) errors.positionId = "Vui lòng chọn vị trí mong muốn";
  if (form.eduLevel === "") errors.eduLevel = "Vui lòng chọn trình độ học vấn";
  if (!form.summary.trim()) errors.summary = "Vui lòng viết vài dòng giới thiệu bản thân";
  else if (form.summary.length > 10000) errors.summary = "Tối đa 10000 ký tự";
  const skills = form.skills.filter((s) => s.skill.trim());
  if (skills.length === 0) errors.skills = "Cần ít nhất một kỹ năng";
  else if (skills.some((s) => s.skill.trim().length > 100)) errors.skills = "Tên kỹ năng tối đa 100 ký tự";
  else if (skills.some((s) => !(Number(s.years) >= 0 && Number.isInteger(Number(s.years))))) {
    errors.skills = "Số năm kinh nghiệm phải là số nguyên không âm";
  }
  return errors;
}

/** Một ô file (ảnh đại diện / file CV): tải lên, xem, gỡ khỏi hồ sơ. */
function FileSlot({ label, hint, accept, attachmentId, uploaded, image, onUploaded, onRemove }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let active = true;
    if (image && attachmentId) {
      userApi
        .fileUrl(attachmentId, getToken)
        .then((res) => active && setPreview(res.url))
        .catch(() => active && setPreview(null));
    }
    return () => {
      active = false;
    };
  }, [image, attachmentId, getToken]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const res = await userApi.upload(file, getToken);
      onUploaded(res);
      toast.success(`Đã tải lên ${res.originalFilename}. Nhớ bấm "Lưu hồ sơ".`);
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    try {
      const res = await userApi.fileUrl(attachmentId, getToken);
      window.open(res.url, "_blank", "noopener");
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 p-4">
      {image && (
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-100 text-xs text-zinc-400">
          {attachmentId && preview ? <img src={preview} alt="Ảnh đại diện" className="h-full w-full object-cover" /> : "Ảnh"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        <p className="truncate text-xs text-zinc-500">
          {uploaded
            ? `${uploaded.originalFilename} · ${formatFileSize(uploaded.fileSize)}`
            : attachmentId
              ? "Đã có file"
              : hint}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        {attachmentId && (
          <Button tone="secondary" size="sm" onClick={open}>
            Xem
          </Button>
        )}
        <label className={`cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 ${busy ? "opacity-60" : ""}`}>
          {busy ? "Đang tải..." : attachmentId ? "Thay file" : "Tải lên"}
          <input type="file" accept={accept} className="hidden" onChange={upload} disabled={busy} />
        </label>
        {attachmentId && (
          <Button tone="ghost" size="sm" onClick={onRemove}>
            Gỡ
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MyCv() {
  const { getToken } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null });
  const [catalog, setCatalog] = useState({ positions: [], locations: [] });
  const [hasCv, setHasCv] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [uploaded, setUploaded] = useState({ image: null, cv: null });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => {
    setState({ loading: true, error: null });
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.allSettled([userApi.getCv(getToken), userApi.positions(getToken), userApi.locations(getToken)]).then(
      ([cv, positions, locations]) => {
        if (!active) return;
        if (cv.status === "rejected" && !(cv.reason instanceof ApiError && cv.reason.status === 404)) {
          setState({ loading: false, error: cv.reason });
          return;
        }
        const exists = cv.status === "fulfilled" && Boolean(cv.value);
        setHasCv(exists);
        setForm(cvToForm(exists ? cv.value : null));
        setCatalog({
          positions: positions.status === "fulfilled" ? positions.value : [],
          locations: locations.status === "fulfilled" ? locations.value : [],
        });
        setState({ loading: false, error: null });
      },
    );
    return () => {
      active = false;
    };
  }, [getToken, reloadKey]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const updateSkill = (index, patch) =>
    setForm((f) => ({ ...f, skills: f.skills.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  async function save(event) {
    event.preventDefault();
    const found = validateCv(form, catalog);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Hồ sơ chưa đủ thông tin. Vui lòng điền các mục được đánh dấu *.");
      return;
    }
    setSaving(true);
    try {
      const body = toBody(form);
      const saved = hasCv ? await userApi.updateCv(body, getToken) : await userApi.createCv(body, getToken);
      setHasCv(true);
      setForm(cvToForm(saved));
      toast.success(hasCv ? "Đã cập nhật hồ sơ." : "Đã tạo hồ sơ.");
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fieldErrors() : {});
      toast.error(error);
    } finally {
      setSaving(false);
    }
  }

  async function removeCv() {
    setDeleting(true);
    try {
      await userApi.deleteCv(getToken);
      setHasCv(false);
      setForm(EMPTY);
      setUploaded({ image: null, cv: null });
      setConfirmDelete(false);
      toast.success("Đã xóa hồ sơ.");
    } catch (error) {
      toast.error(error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AccountLayout
      title="Hồ sơ CV"
      subtitle={hasCv ? "Cập nhật thông tin để nhà tuyển dụng hiểu rõ bạn hơn." : "Bạn chưa có hồ sơ. Điền thông tin và lưu để tạo."}
    >
      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message="Không tải được hồ sơ." onRetry={reload} />}
      {!state.loading && !state.error && (
        <form onSubmit={save} noValidate className="space-y-6">
          <Card title="Tài liệu">
            <div className="space-y-3">
              <FileSlot
                image
                label="Ảnh đại diện"
                hint="JPG/PNG"
                accept="image/*"
                attachmentId={form.imageAttachmentId}
                uploaded={uploaded.image}
                onUploaded={(res) => {
                  setForm((f) => ({ ...f, imageAttachmentId: res.id }));
                  setUploaded((u) => ({ ...u, image: res }));
                }}
                onRemove={() => {
                  setForm((f) => ({ ...f, imageAttachmentId: null }));
                  setUploaded((u) => ({ ...u, image: null }));
                }}
              />
              <FileSlot
                label="File CV"
                hint="PDF/DOC/DOCX — dùng khi ứng tuyển"
                accept=".pdf,.doc,.docx"
                attachmentId={form.cvAttachmentId}
                uploaded={uploaded.cv}
                onUploaded={(res) => {
                  setForm((f) => ({ ...f, cvAttachmentId: res.id }));
                  setUploaded((u) => ({ ...u, cv: res }));
                }}
                onRemove={() => {
                  setForm((f) => ({ ...f, cvAttachmentId: null }));
                  setUploaded((u) => ({ ...u, cv: null }));
                }}
              />
            </div>
          </Card>

          <Card title="Thông tin nghề nghiệp">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Vị trí mong muốn"
                htmlFor="cv-position"
                required={catalog.positions.length > 0}
                error={errors.positionId}
              >
                <select id="cv-position" value={form.positionId} onChange={set("positionId")} className={inputClass}>
                  <option value="">Chọn vị trí</option>
                  {catalog.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Địa điểm làm việc"
                htmlFor="cv-location"
                error={errors.workLocationId}
                hint={catalog.locations.length ? undefined : "Danh mục địa điểm của user-service đang trống"}
              >
                <select id="cv-location" value={form.workLocationId} onChange={set("workLocationId")} className={inputClass}>
                  <option value="">Chọn địa điểm</option>
                  {catalog.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Trình độ học vấn" htmlFor="cv-edu" required error={errors.eduLevel}>
                <select id="cv-edu" value={form.eduLevel} onChange={set("eduLevel")} className={inputClass}>
                  <option value="">Chọn trình độ</option>
                  {EDU_LEVELS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Học vấn / chuyên ngành" htmlFor="cv-education" error={errors.education}>
                <input
                  id="cv-education"
                  value={form.education}
                  onChange={set("education")}
                  placeholder="Ví dụ: Cử nhân Công nghệ thông tin"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field
              label="Giới thiệu bản thân"
              htmlFor="cv-summary"
              required
              error={errors.summary}
              hint={`${form.summary.length}/10000 ký tự`}
              className="mt-4"
            >
              <textarea
                id="cv-summary"
                rows={6}
                maxLength={10000}
                value={form.summary}
                onChange={set("summary")}
                placeholder="Tóm tắt kinh nghiệm và định hướng của bạn..."
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
                onClick={() => setForm((f) => ({ ...f, skills: [...f.skills, { skillId: null, skill: "", years: "0" }] }))}
              >
                + Thêm kỹ năng
              </Button>
            }
          >
            {form.skills.length === 0 && (
              <p className="text-sm text-zinc-500">Chưa có kỹ năng nào. Hồ sơ cần ít nhất một kỹ năng.</p>
            )}
            <div className="space-y-2">
              {form.skills.map((skill, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={skill.skill}
                    onChange={(e) => updateSkill(index, { skill: e.target.value, skillId: null })}
                    placeholder="Tên kỹ năng, ví dụ: React"
                    aria-label={`Kỹ năng ${index + 1}`}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min={0}
                    value={skill.years}
                    onChange={(e) => updateSkill(index, { years: e.target.value })}
                    aria-label={`Số năm kinh nghiệm kỹ năng ${index + 1}`}
                    className={`${inputClass} w-28`}
                  />
                  <span className="self-center text-xs text-zinc-500">năm</span>
                  <Button
                    tone="ghost"
                    onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((_, i) => i !== index) }))}
                  >
                    Xóa
                  </Button>
                </div>
              ))}
            </div>
            {errors.skills && <p className="mt-2 text-xs text-red-600">{errors.skills}</p>}
          </Card>

          <div className="flex flex-wrap justify-between gap-2">
            {hasCv ? (
              <Button tone="danger" onClick={() => setConfirmDelete(true)}>
                Xóa hồ sơ
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" busy={saving}>
              {hasCv ? "Lưu hồ sơ" : "Tạo hồ sơ"}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Xóa hồ sơ CV?"
        message="Toàn bộ thông tin hồ sơ sẽ bị xóa. Các đơn đã nộp vẫn được giữ."
        confirmLabel="Xóa hồ sơ"
        busy={deleting}
        onConfirm={removeCv}
        onCancel={() => setConfirmDelete(false)}
      />
    </AccountLayout>
  );
}
