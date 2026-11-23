export async function apiRequest(path, options = {}, getToken) {
  const token = getToken ? await getToken() : null;
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`.trim());
  if (response.status === 204) return null;
  return response.json();
}

export const userApi = {
  context: (getToken) => apiRequest("/api/users/me/context", {}, getToken),
  cv: (getToken) => apiRequest("/api/cvs/me", {}, getToken),
  positions: (getToken) => apiRequest("/api/positions", {}, getToken),
  locations: (getToken) => apiRequest("/api/locations", {}, getToken),
  saveCv: (body, getToken) => apiRequest("/api/cvs/me", { method: "PUT", body: JSON.stringify(body) }, getToken),
  createCv: (body, getToken) => apiRequest("/api/cvs", { method: "POST", body: JSON.stringify(body) }, getToken),
  upload: (file, getToken) => {
    const data = new FormData();
    data.append("file", file);
    return apiRequest("/api/attachments", { method: "POST", body: data }, getToken);
  },
};
