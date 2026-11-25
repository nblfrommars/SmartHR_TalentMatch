import { apiRequest } from "./api";

// Chỉ role ADMIN. Không có tạo user và cấu hình địa điểm (đã bỏ theo quyết định của nhóm).
export const adminApi = {
  users: (getToken) => apiRequest("/api/v1/users", { getToken }),
  positions: (getToken) => apiRequest("/api/v1/positions", { getToken }),
  createPosition: (body, getToken) => apiRequest("/api/v1/positions", { method: "POST", body, getToken }),
  updatePosition: (id, body, getToken) =>
    apiRequest(`/api/v1/positions/${id}`, { method: "PUT", body, getToken }),
  deactivatePosition: (id, getToken) =>
    apiRequest(`/api/v1/positions/${id}`, { method: "DELETE", getToken }),
};
