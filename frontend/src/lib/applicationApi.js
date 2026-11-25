import { apiRequest } from "./api";

export const applicationApi = {
  /** body: { coverLetter, cvAttachmentId? } — bỏ trống cvAttachmentId thì backend dùng CV trong hồ sơ. */
  apply: (jobId, body, getToken) =>
    apiRequest(`/api/v1/applications/jobs/${jobId}`, { method: "POST", body, getToken }),
  mine: (getToken) => apiRequest("/api/v1/applications/me", { getToken }),
  withdraw: (id, getToken) => apiRequest(`/api/v1/applications/${id}`, { method: "DELETE", getToken }),
  /** HR: danh sách đơn của một tin do chính mình đăng (user-cv kiểm tra quyền sở hữu qua job-service). */
  forJob: (jobId, getToken) => apiRequest(`/api/v1/applications/jobs/${jobId}`, { getToken }),
};

export const APPLICATION_STATUS = {
  APPLIED: { label: "Đã nộp", tone: "brand" },
  REVIEWING: { label: "Đang xem xét", tone: "accent" },
  SHORTLISTED: { label: "Vào vòng trong", tone: "success" },
  REJECTED: { label: "Không phù hợp", tone: "neutral" },
  HIRED: { label: "Đã tuyển", tone: "success" },
  WITHDRAWN: { label: "Đã rút", tone: "neutral" },
};

export const WITHDRAWABLE = ["APPLIED", "REVIEWING"];
