import { createContext, useContext } from "react";

export const NotificationContext = createContext({
  unread: 0,
  connected: false,
  changeKey: 0,
  refresh: () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

/**
 * unread: số thông báo chưa đọc; connected: WebSocket realtime đang mở;
 * changeKey: tăng mỗi khi có thông báo mới hoặc "đọc tất cả" (để trang danh sách tải lại).
 */
export function useNotifications() {
  return useContext(NotificationContext);
}
