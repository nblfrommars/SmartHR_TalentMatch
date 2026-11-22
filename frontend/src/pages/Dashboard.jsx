import { useAuth } from "../auth/useAuth";

export default function Dashboard() {
  const { logout } = useAuth();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-8 text-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-600">SmartHR</p>
          <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
        </div>
        <button onClick={logout} className="button">Đăng xuất</button>
      </div>
      <section className="mx-auto mt-12 max-w-5xl rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-lg shadow-cyan-100">
        <p className="text-xl font-medium text-slate-600">Đang hoàn thiện</p>
      </section>
    </main>
  );
}
