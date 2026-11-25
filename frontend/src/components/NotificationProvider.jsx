import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { NotificationContext } from "../lib/notificationContext";
import { notificationApi } from "../lib/notificationApi";
import { useToast } from "../lib/toastContext";

const WS_PATH = "/ws/notifications";
const POLL_MS = 60_000; // dự phòng khi WebSocket không mở được
const RENEW_BEFORE_MS = 20_000; // gửi token mới trước khi token cũ hết hạn

function socketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${WS_PATH}`;
}

/**
 * Đếm thông báo chưa đọc và nhận thông báo realtime từ notification-service.
 * Giao thức WebSocket (notification-service/src/realtime/ws-server.js):
 *   client gửi {"type":"auth","token"} ngay sau khi mở; server trả "connected" kèm expiresAt;
 *   trước khi token hết hạn client gửi lại auth với token mới; server đẩy notification.created / read / read_all.
 */
export default function NotificationProvider({ children }) {
  const { authenticated, getToken } = useAuth();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const [changeKey, setChangeKey] = useState(0);

  const refresh = useCallback(() => {
    notificationApi
      .unreadCount(getToken)
      .then((res) => setUnread(res?.count ?? 0))
      .catch(() => {});
  }, [getToken]);

  useEffect(() => {
    if (!authenticated) return undefined;
    let stopped = false;
    let socket = null;
    let retryTimer = null;
    let renewTimer = null;
    let attempts = 0;

    refresh();
    const poll = setInterval(refresh, POLL_MS);

    function scheduleRenew(expiresAt) {
      clearTimeout(renewTimer);
      const expiry = Date.parse(expiresAt);
      if (Number.isNaN(expiry)) return;
      renewTimer = setTimeout(async () => {
        const token = await getToken(); // keycloak.updateToken(30) cấp token mới khi sắp hết hạn
        if (token && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "auth", token }));
      }, Math.max(5_000, expiry - Date.now() - RENEW_BEFORE_MS));
    }

    function onMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "connected":
          attempts = 0;
          setConnected(true);
          scheduleRenew(message.data?.expiresAt);
          refresh();
          break;
        case "auth.renewed":
          scheduleRenew(message.data?.expiresAt);
          break;
        case "notification.created":
          setUnread((n) => n + 1);
          setChangeKey((k) => k + 1);
          if (message.data?.title) toast.info(`Thông báo mới: ${message.data.title}`);
          break;
        case "notification.read":
          refresh();
          break;
        case "notification.read_all":
          setUnread(0);
          setChangeKey((k) => k + 1);
          break;
        default:
      }
    }

    function connect() {
      if (stopped) return;
      socket = new WebSocket(socketUrl());
      socket.onopen = async () => {
        const token = await getToken();
        if (!token) {
          socket.close();
          return;
        }
        socket.send(JSON.stringify({ type: "auth", token }));
      };
      socket.onmessage = onMessage;
      socket.onclose = () => {
        setConnected(false);
        clearTimeout(renewTimer);
        if (stopped) return;
        // Thử lại với thời gian chờ tăng dần: 2s, 4s, 8s... tối đa 30s
        retryTimer = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** attempts));
        attempts += 1;
      };
    }

    connect();

    return () => {
      stopped = true;
      clearInterval(poll);
      clearTimeout(retryTimer);
      clearTimeout(renewTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [authenticated, getToken, refresh, toast]);

  const markRead = useCallback(
    async (id) => {
      const updated = await notificationApi.markRead(id, getToken);
      refresh();
      return updated;
    },
    [getToken, refresh],
  );

  const markAllRead = useCallback(async () => {
    const res = await notificationApi.markAllRead(getToken);
    setUnread(0);
    setChangeKey((k) => k + 1);
    return res;
  }, [getToken]);

  const value = useMemo(
    () => ({
      unread: authenticated ? unread : 0,
      connected: authenticated && connected,
      changeKey,
      refresh,
      markRead,
      markAllRead,
    }),
    [authenticated, unread, connected, changeKey, refresh, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
