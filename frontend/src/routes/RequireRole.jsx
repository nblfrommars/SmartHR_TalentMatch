import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Loading } from "../components/PageState";
import PublicLayout from "../components/PublicLayout";

function Gate({ title, children }) {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-extrabold text-zinc-900">{title}</h1>
        <div className="mt-4 space-y-4 text-zinc-600">{children}</div>
      </div>
    </PublicLayout>
  );
}

/** Ẩn/hiện theo đăng nhập và vai trò. Backend vẫn là nơi chặn quyền thật. */
export default function RequireRole({ roles, children }) {
  const { ready, authenticated, unavailable, hasRole, login } = useAuth();

  if (!ready) {
    return (
      <PublicLayout>
        <Loading label="Đang kiểm tra đăng nhập..." />
      </PublicLayout>
    );
  }

  if (!authenticated) {
    return (
      <Gate title="Bạn cần đăng nhập">
        {unavailable ? (
          <p>Không kết nối được tới máy chủ đăng nhập (Keycloak, cổng 8180). Vui lòng thử lại sau.</p>
        ) : (
          <>
            <p>Trang này chỉ dành cho người dùng đã đăng nhập.</p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => login()}
                className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
              >
                Đăng nhập
              </button>
              <Link
                to="/register"
                className="rounded-lg border border-zinc-300 px-5 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Đăng ký
              </Link>
            </div>
          </>
        )}
      </Gate>
    );
  }

  if (roles && !roles.some(hasRole)) {
    return (
      <Gate title="Không có quyền truy cập">
        <p>Tài khoản của bạn không có quyền vào trang này.</p>
        <Link to="/" className="font-semibold text-brand-600 hover:underline">
          Về trang chủ
        </Link>
      </Gate>
    );
  }

  return children;
}
