import { ApiError, apiRequest, toQuery } from "./api";

const BASE = "/api/v1/jobs";

export const jobApi = {
  // Công khai
  search: (params) => apiRequest(`${BASE}${toQuery(params)}`),
  /** Gửi token nếu có: chủ job xem được cả tin đã đóng/hết hạn. */
  get: (id, getToken) => apiRequest(`${BASE}/${encodeURIComponent(id)}`, { getToken }),
  industries: () => apiRequest(`${BASE}/industries`),
  locations: () => apiRequest(`${BASE}/locations`),

  // HR (job-service tự verify JWT; cần role HR, sửa/đóng/xóa chỉ chủ tin)
  mine: (params, getToken) => apiRequest(`${BASE}/my${toQuery(params)}`, { getToken }),
  create: (body, getToken) => apiRequest(BASE, { method: "POST", body, getToken }),
  update: (id, body, getToken) => apiRequest(`${BASE}/${id}`, { method: "PUT", body, getToken }),
  close: (id, getToken) => apiRequest(`${BASE}/${id}/close`, { method: "PATCH", getToken }),
  remove: (id, getToken) => apiRequest(`${BASE}/${id}`, { method: "DELETE", getToken }),
};

export function isNotFound(error) {
  return error instanceof ApiError && error.status === 404;
}
