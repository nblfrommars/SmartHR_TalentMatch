import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Form";
import { Loading } from "../components/PageState";
import PublicLayout from "../components/PublicLayout";
import { homeFor } from "../lib/navigation";

export default function Login() {
  const { ready, authenticated, unavailable, hasRole, login } = useAuth();

  if (ready && authenticated) return <Navigate to={homeFor(hasRole)} replace />;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">T</span>
          <h1 className="mt-4 text-2xl font-extrabold text-zinc-900">Đăng nhập TalentMatch</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Bạn sẽ được chuyển sang trang đăng nhập bảo mật (Keycloak), sau đó quay lại đây.
          </p>
          <div className="mt-6">
            {!ready && <Loading label="Đang kết nối máy chủ đăng nhập..." />}
            {ready && unavailable && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Không kết nối được tới Keycloak (cổng 8180). Kiểm tra container keycloak đã chạy chưa.
              </p>
            )}
            {ready && !unavailable && (
              <Button onClick={() => login({ redirectUri: `${window.location.origin}/login` })} className="w-full">
                Đăng nhập
              </Button>
            )}
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            Chưa có tài khoản?{" "}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
