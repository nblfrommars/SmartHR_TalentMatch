import { Button } from "./Form";

/** Hộp xác nhận đơn giản cho thao tác không hoàn tác được (đóng, xóa, rút đơn...). */
export default function ConfirmDialog({ open, title, message, confirmLabel = "Xác nhận", tone = "danger", busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-card-hover">
        <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
        {message && <p className="mt-2 text-sm text-zinc-600">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button tone={tone === "danger" ? "primary" : tone} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
