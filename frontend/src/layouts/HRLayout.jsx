import { useAuth } from "../auth/useAuth";

export default function HRLayout() {
  const { logout } = useAuth();
  return <main className="min-h-screen bg-slate-950 p-8 text-white"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><h1 className="text-3xl font-bold">HR freelance</h1><button onClick={logout} className="button">Đăng xuất</button></div><p className="mt-8 text-slate-300">Khu vực dành cho HR SmartHR.</p></div></main>;
}
