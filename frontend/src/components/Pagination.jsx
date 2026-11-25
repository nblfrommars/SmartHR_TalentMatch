function pageWindow(page, total) {
  const pages = new Set([0, total - 1, page - 1, page, page + 1]);
  return [...pages].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
}

/** page tính từ 0 (đúng với Spring Page). */
export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const items = [];
  pageWindow(page, totalPages).forEach((p, index, all) => {
    if (index > 0 && p - all[index - 1] > 1) items.push({ gap: true, key: `gap-${p}` });
    items.push({ page: p, key: p });
  });
  const base = "grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-medium transition";
  const plain = "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Phân trang">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className={`${base} ${plain} disabled:opacity-40`}
      >
        ‹
      </button>
      {items.map((item) =>
        item.gap ? (
          <span key={item.key} className="px-1 text-zinc-400">
            …
          </span>
        ) : (
          <button
            key={item.key}
            type="button"
            aria-current={item.page === page ? "page" : undefined}
            onClick={() => onChange(item.page)}
            className={`${base} ${item.page === page ? "border-brand-600 bg-brand-600 text-white" : plain}`}
          >
            {item.page + 1}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
        className={`${base} ${plain} disabled:opacity-40`}
      >
        ›
      </button>
    </nav>
  );
}
