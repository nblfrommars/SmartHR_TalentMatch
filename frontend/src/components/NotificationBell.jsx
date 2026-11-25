import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { notificationApi, notificationLink } from "../lib/notificationApi";
import { useNotifications } from "../lib/notificationContext";
import { useToast } from "../lib/toastContext";
import NotificationItem from "./NotificationItem";

const PREVIEW_LIMIT = 8;

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}

export default function NotificationBell() {
  const { getToken } = useAuth();
  const { unread, connected, changeKey, markRead, markAllRead } = useNotifications();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, error: null, items: [] });
  const ref = useRef(null);

  useEffect(() => {
    function onClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Tải danh sách khi mở; đang mở mà có thông báo mới thì tải lại
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    notificationApi
      .list({ limit: PREVIEW_LIMIT }, getToken)
      .then((res) => active && setState({ loading: false, error: null, items: res?.items || [] }))
      .catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => {
      active = false;
    };
  }, [open, changeKey, getToken]);

  function toggle() {
    if (!open) setState((s) => ({ ...s, loading: s.items.length === 0, error: null }));
    setOpen((v) => !v);
  }

  async function openItem(notification) {
    setOpen(false);
    if (!notification.read) {
      markRead(notification.id).catch(() => {});
      setState((s) => ({ ...s, items: s.items.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) }));
    }
    const link = notificationLink(notification);
    if (link) navigate(link);
  }

  async function readAll() {
    try {
      await markAllRead();
      setState((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) }));
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative grid h-10 w-10 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card-hover">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="font-semibold text-zinc-900">Thông báo</p>
              <p className="text-xs text-zinc-400">{connected ? "Đang nhận thông báo trực tiếp" : "Cập nhật mỗi phút"}</p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-semibold text-brand-600 hover:underline">
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-96 divide-y divide-zinc-100 overflow-y-auto">
            {state.loading && <p className="px-4 py-6 text-center text-sm text-zinc-500">Đang tải...</p>}
            {!state.loading && state.error && (
              <p className="px-4 py-6 text-center text-sm text-red-600">Không tải được thông báo.</p>
            )}
            {!state.loading && !state.error && state.items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Bạn chưa có thông báo nào.</p>
            )}
            {!state.loading &&
              state.items.map((n) => <NotificationItem key={n.id} notification={n} onOpen={openItem} compact />)}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-zinc-50"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}
