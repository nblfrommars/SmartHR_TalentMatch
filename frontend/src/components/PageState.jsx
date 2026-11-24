export function Loading({ label = "Đang tải..." }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-zinc-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      {label}
    </div>
  );
}

export function Empty({ title, hint }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <p className="text-base font-semibold text-zinc-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ message = "Không thể tải dữ liệu.", onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center" role="alert">
      <p className="font-semibold text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
