import { apiRequest } from "./api";

export const userApi = {
  register: (body) => apiRequest("/api/v1/users/register", { method: "POST", body }),
  context: (getToken) => apiRequest("/api/v1/users/me/context", { getToken }),

  // Hồ sơ CV của chính mình (cvId = userId)
  getCv: (getToken) => apiRequest("/api/v1/cvs/me", { getToken }),
  createCv: (body, getToken) => apiRequest("/api/v1/cvs", { method: "POST", body, getToken }),
  updateCv: (body, getToken) => apiRequest("/api/v1/cvs/me", { method: "PUT", body, getToken }),
  deleteCv: (getToken) => apiRequest("/api/v1/cvs/me", { method: "DELETE", getToken }),

  // File đính kèm (MinIO qua user-service)
  upload: (file, getToken) => {
    const data = new FormData();
    data.append("file", file);
    return apiRequest("/api/v1/attachments", { method: "POST", body: data, getToken });
  },
  fileUrl: (id, getToken) => apiRequest(`/api/v1/attachments/${id}/url`, { getToken }),
  deleteFile: (id, getToken) => apiRequest(`/api/v1/attachments/${id}`, { method: "DELETE", getToken }),

  // Danh mục của user-service (cần đăng nhập)
  positions: (getToken) => apiRequest("/api/v1/positions", { getToken }),
  locations: (getToken) => apiRequest("/api/v1/locations", { getToken }),
};
