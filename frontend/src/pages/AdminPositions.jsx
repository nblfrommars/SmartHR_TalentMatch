import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button, Card, Field } from "../components/Form";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { ApiError } from "../lib/api";
import { adminApi } from "../lib/adminApi";
import { useToast } from "../lib/toastContext";
import { inputClass } from "../lib/ui";

const EMPTY = { code: "", name: "", description: "" };

function PositionForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const found = {};
    if (!form.code.trim()) found.code = "Không được để trống";
    if (!form.name.trim()) found.name = "Không được để trống";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSubmit({ code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null });
      setForm(initial);
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fieldErrors() : {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-start">
      <Field htmlFor="pos-code" error={errors.code}>
        <input id="pos-code" value={form.code} onChange={set("code")} placeholder="Mã (VD: BE_DEV)" aria-label="Mã vị trí" className={inputClass} />
      </Field>
      <Field htmlFor="pos-name" error={errors.name}>
        <input id="pos-name" value={form.name} onChange={set("name")} placeholder="Tên vị trí" aria-label="Tên vị trí" className={inputClass} />
      </Field>
      <Field htmlFor="pos-desc">
        <input id="pos-desc" value={form.description} onChange={set("description")} placeholder="Mô tả (không bắt buộc)" aria-label="Mô tả" className={inputClass} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
        )}
      </div>
    </form>
  );
}

/** Quản lý vị trí mong muốn (positions) của user-service. Danh sách chỉ gồm vị trí đang bật. */
export default function AdminPositions() {
  const { getToken } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    adminApi
      .positions(getToken)
      .then((items) => active && setState({ loading: false, error: null, items }))
      .catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => {
      active = false;
    };
  }, [getToken, reloadKey]);

  async function create(body) {
    try {
      await adminApi.createPosition(body, getToken);
      toast.success("Đã thêm vị trí.");
      load();
    } catch (error) {
      toast.error(error);
      throw error;
    }
  }

  async function update(body) {
    try {
      await adminApi.updatePosition(editing.id, body, getToken);
      toast.success("Đã cập nhật vị trí.");
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error);
      throw error;
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      await adminApi.deactivatePosition(pending.id, getToken);
      toast.success("Đã ẩn vị trí.");
      setPending(null);
      load();
    } catch (error) {
      toast.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountLayout title="Vị trí" subtitle="Danh mục vị trí mong muốn mà ứng viên chọn trong hồ sơ CV.">
      <Card title="Thêm vị trí" className="mb-6">
        <PositionForm initial={EMPTY} submitLabel="Thêm" onSubmit={create} />
      </Card>

      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message="Không tải được danh sách vị trí." onRetry={load} />}
      {!state.loading && !state.error && state.items.length === 0 && <Empty title="Chưa có vị trí nào" />}
      {!state.loading && state.items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
          <ul className="divide-y divide-zinc-100">
            {state.items.map((item) => (
              <li key={item.id} className="p-4">
                {editing?.id === item.id ? (
                  <PositionForm
                    initial={{ code: item.code || "", name: item.name || "", description: item.description || "" }}
                    submitLabel="Lưu"
                    onSubmit={update}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">
                        {item.name} <span className="ml-1 font-mono text-xs text-zinc-400">{item.code}</span>
                      </p>
                      {item.description && <p className="text-sm text-zinc-500">{item.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button tone="secondary" size="sm" onClick={() => setEditing(item)}>
                        Sửa
                      </Button>
                      <Button tone="danger" size="sm" onClick={() => setPending(item)}>
                        Ẩn
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Ẩn vị trí?"
        message={pending ? `“${pending.name}” sẽ không còn xuất hiện trong danh sách chọn của ứng viên.` : ""}
        confirmLabel="Ẩn"
        busy={busy}
        onConfirm={deactivate}
        onCancel={() => setPending(null)}
      />
    </AccountLayout>
  );
}
