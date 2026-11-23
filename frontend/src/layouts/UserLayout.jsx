import { useAuth } from "../auth/useAuth";

export default function UserLayout() {
  const { logout } = useAuth();
  return <main className="min-h-screen bg-slate-950 p-8 text-white"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><h1 className="text-3xl font-bold">Ứng viên</h1><button onClick={logout} className="button">Đăng xuất</button></div><p className="mt-8 text-slate-300">Khu vực dành cho ứng viên SmartHR.</p></div></main>;
}
