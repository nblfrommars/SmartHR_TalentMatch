import { apiRequest } from "./api";

// API công khai của job-service: không truyền getToken nên không gửi Bearer.

function toQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const jobApi = {
  search: (params) => apiRequest(`/api/v1/jobs${toQuery(params)}`),
  get: (id) => apiRequest(`/api/v1/jobs/${encodeURIComponent(id)}`),
  industries: () => apiRequest("/api/v1/industries"),
  locations: () => apiRequest("/api/v1/locations"),
};

export function isNotFound(error) {
  return typeof error?.message === "string" && error.message.startsWith("404");
}
