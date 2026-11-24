import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import AccountLayout from "../components/AccountLayout";
import Badge from "../components/Badge";
import { Empty, ErrorBox, Loading } from "../components/PageState";
import { adminApi } from "../lib/adminApi";
import { ROLE_LABELS } from "../lib/format";
import { inputClass } from "../lib/ui";

const GENDER_LABELS = { MALE: "Nam", FEMALE: "Nữ", NOINFO: "—" };

/** Danh sách user (chỉ xem). Không có tạo user — đã bỏ theo quyết định của nhóm. */
export default function AdminUsers() {
  const { getToken } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, users: [] });
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    adminApi
      .users(getToken)
      .then((users) => active && setState({ loading: false, error: null, users }))
      .catch((error) => active && setState({ loading: false, error, users: [] }));
    return () => {
      active = false;
    };
  }, [getToken, reloadKey]);

  const users = useMemo(() => {
    const text = query.trim().toLowerCase();
    return state.users.filter(
      (u) =>
        (!role || u.role === role) &&
        (!text || `${u.userName} ${u.fullName || ""}`.toLowerCase().includes(text)),
    );
  }, [state.users, query, role]);

  return (
    <AccountLayout title="Người dùng" subtitle={`${state.users.length} tài khoản`}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo username hoặc họ tên"
          aria-label="Tìm người dùng"
          className={inputClass}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Lọc vai trò" className={`${inputClass} sm:w-52`}>
          <option value="">Tất cả vai trò</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {state.loading && <Loading />}
      {!state.loading && state.error && <ErrorBox message="Không tải được danh sách người dùng." onRetry={load} />}
      {!state.loading && !state.error && users.length === 0 && <Empty title="Không có người dùng phù hợp" />}
      {!state.loading && users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Họ tên</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Giới tính</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{u.userName}</td>
                  <td className="px-4 py-3 text-zinc-700">{u.fullName || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.role === "ADMIN" ? "danger" : u.role === "HR" ? "accent" : "brand"}>
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{GENDER_LABELS[u.gender] || "—"}</td>
                  <td className="px-4 py-3">
                    {u.active ? <Badge tone="success">Hoạt động</Badge> : <Badge>Bị khóa</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccountLayout>
  );
}
