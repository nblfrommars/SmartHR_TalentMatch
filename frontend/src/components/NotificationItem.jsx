import { timeAgo } from "../lib/format";

/** Một dòng thông báo; dùng chung cho chuông trên header và trang /notifications. */
export default function NotificationItem({ notification, onOpen, compact = false }) {
  const { title, body, read, createdAt } = notification;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`flex w-full gap-3 text-left transition hover:bg-zinc-50 ${compact ? "px-4 py-3" : "px-5 py-4"} ${
        read ? "" : "bg-brand-50/50"
      }`}
    >
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${read ? "bg-transparent" : "bg-brand-600"}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900"}`}>{title}</span>
        {body && <span className={`mt-0.5 block text-sm text-zinc-600 ${compact ? "line-clamp-2" : ""}`}>{body}</span>}
        <span className="mt-1 block text-xs text-zinc-400">{timeAgo(createdAt)}</span>
      </span>
      {!read && <span className="sr-only">Chưa đọc</span>}
    </button>
  );
}
