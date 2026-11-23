import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function Login() {
  const { authenticated, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) navigate("/dashboard", { replace: true });
  }, [authenticated, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-cyan-50 via-white to-blue-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-blue-100">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-600">SmartHR</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Đăng nhập</h1>
        <p className="mt-3 text-slate-500">Đăng nhập an toàn với tài khoản Keycloak của bạn.</p>
        <button onClick={() => login()} className="button mt-8 w-full">Đăng nhập với Keycloak</button>
        <p className="mt-5 text-sm text-slate-500">Chưa có tài khoản? <Link to="/register" className="font-semibold text-cyan-600 hover:text-cyan-700">Đăng ký</Link></p>
      </section>
    </main>
  );
}
