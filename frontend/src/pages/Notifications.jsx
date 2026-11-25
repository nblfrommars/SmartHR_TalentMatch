import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import { Button } from "../components/Form";
import NotificationItem from "../components/NotificationItem";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { notificationApi, notificationLink } from "../lib/notificationApi";
import { useNotifications } from "../lib/notificationContext";
import { useToast } from "../lib/toastContext";

const PAGE_SIZE = 20;

export default function Notifications() {
  const { getToken } = useAuth();
  const { unread, changeKey, markRead, markAllRead } = useNotifications();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: null, items: [], nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Trang đầu; tải lại khi có thông báo mới (changeKey) hoặc bấm "Thử lại"
  useEffect(() => {
    let active = true;
    notificationApi
      .list({ limit: PAGE_SIZE }, getToken)
      .then((res) => active && setState({ loading: false, error: null, items: res?.items || [], nextCursor: res?.nextCursor || null }))
      .catch((error) => active && setState({ loading: false, error, items: [], nextCursor: null }));
    return () => {
      active = false;
    };
  }, [getToken, changeKey, reloadKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await notificationApi.list({ limit: PAGE_SIZE, cursor: state.nextCursor }, getToken);
      setState((s) => ({ ...s, items: [...s.items, ...(res?.items || [])], nextCursor: res?.nextCursor || null }));
    } catch (error) {
      toast.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  function openItem(notification) {
    if (!notification.read) {
      markRead(notification.id).catch((error) => toast.error(error));
      setState((s) => ({ ...s, items: s.items.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) }));
    }
    const link = notificationLink(notification);
    if (link) navigate(link);
  }

  async function readAll() {
    try {
      const res = await markAllRead();
      toast.success(res?.updated ? `Đã đánh dấu ${res.updated} thông báo là đã đọc.` : "Không còn thông báo chưa đọc.");
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <AccountLayout
      title="Thông báo"
      subtitle={unread ? `${unread} thông báo chưa đọc` : "Bạn đã đọc hết thông báo"}
      actions={
        unread > 0 && (
          <Button tone="secondary" onClick={readAll}>
            Đánh dấu đã đọc tất cả
          </Button>
        )
      }
    >
      {state.loading && <Loading />}
      {!state.loading && state.error && (
        <ErrorBox
          message="Không tải được thông báo. Kiểm tra notification-service đã chạy chưa."
          onRetry={() => {
            setState((s) => ({ ...s, loading: true, error: null }));
            setReloadKey((k) => k + 1);
          }}
        />
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <Empty
          title="Chưa có thông báo"
          hint="Nhà tuyển dụng nhận thông báo khi có ứng viên nộp đơn hoặc khi tin tuyển dụng hết hạn."
        />
      )}
      {!state.loading && state.items.length > 0 && (
        <>
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
            {state.items.map((n) => (
              <NotificationItem key={n.id} notification={n} onOpen={openItem} />
            ))}
          </div>
          {state.nextCursor && (
            <div className="mt-4 text-center">
              <Button tone="secondary" busy={loadingMore} onClick={loadMore}>
                Xem thêm
              </Button>
            </div>
          )}
        </>
      )}
    </AccountLayout>
  );
}
