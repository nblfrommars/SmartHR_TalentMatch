// Mọi request đi qua api-gateway (Vite proxy "/api" -> http://localhost:8080).

const STATUS_MESSAGES = {
  400: "Dữ liệu gửi lên chưa hợp lệ.",
  401: "Bạn cần đăng nhập (hoặc phiên đăng nhập đã hết hạn).",
  403: "Bạn không có quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu.",
  409: "Thao tác bị từ chối do xung đột dữ liệu.",
  413: "File quá lớn.",
  429: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.",
  500: "Máy chủ gặp lỗi, vui lòng thử lại sau.",
  502: "Dịch vụ liên quan đang gặp sự cố.",
  503: "Dịch vụ tạm thời không khả dụng.",
};

export class ApiError extends Error {
  constructor(status, message, details = [], serverMessage = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details; // [{ field, message }] từ GlobalExceptionHandler (common-lib)
    this.serverMessage = serverMessage;
  }

  /** Lỗi theo trường: { title: "must not be blank", ... } */
  fieldErrors() {
    return Object.fromEntries((this.details || []).filter((d) => d.field).map((d) => [d.field, d.message]));
  }
}

async function readError(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const serverMessage = body?.message || body?.error || "";
  const friendly = STATUS_MESSAGES[response.status] || `Lỗi ${response.status}.`;
  return new ApiError(response.status, friendly, body?.details || [], serverMessage);
}

/**
 * @param {string} path      đường dẫn bắt đầu bằng /api/v1
 * @param {object} options   { method, body, getToken, signal }
 *   - body: object (gửi JSON) hoặc FormData
 *   - getToken: hàm async trả access token (bỏ qua nếu là API công khai)
 */
export async function apiRequest(path, { method = "GET", body, getToken, signal } = {}) {
  const headers = new Headers();
  const token = getToken ? await getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, { method, headers, body: payload, signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(0, "Không kết nối được tới máy chủ. Kiểm tra api-gateway (cổng 8080) đã chạy chưa.");
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function toQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Thông điệp hiển thị cho người dùng, kèm nội dung server trả về nếu có. */
export function errorText(error) {
  if (!error) return "";
  if (error instanceof ApiError) {
    return error.serverMessage ? `${error.message} (${error.serverMessage})` : error.message;
  }
  return error.message || "Đã có lỗi xảy ra.";
}
