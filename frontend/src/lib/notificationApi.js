import { apiRequest, toQuery } from "./api";

const BASE = "/api/v1/notifications";

// notification-service (qua api-gateway). Mọi API chỉ thao tác trên thông báo của người đang đăng nhập.
export const notificationApi = {
  /** { items: NotificationDto[], nextCursor: string | null } */
  list: ({ limit = 20, cursor } = {}, getToken) => apiRequest(`${BASE}${toQuery({ limit, cursor })}`, { getToken }),
  /** { count } */
  unreadCount: (getToken) => apiRequest(`${BASE}/unread-count`, { getToken }),
  markRead: (id, getToken) => apiRequest(`${BASE}/${id}/read`, { method: "PATCH", getToken }),
  /** { updated } */
  markAllRead: (getToken) => apiRequest(`${BASE}/read-all`, { method: "PATCH", getToken }),
};

/** Trang cần mở khi bấm vào thông báo (xem notification-service/EVENTS.md). */
export function notificationLink(notification) {
  const data = notification?.data || {};
  switch (notification?.type) {
    case "APPLICATION_RECEIVED":
      return data.jobId
        ? `/hr/jobs/${data.jobId}/applicants${data.applicationId ? `?highlight=${data.applicationId}` : ""}`
        : null;
    case "JOB_EXPIRED":
      return data.jobId ? `/jobs/${data.jobId}` : null;
    default:
      if (notification?.entityType === "JOB" && notification.entityId) return `/jobs/${notification.entityId}`;
      return null;
  }
}
