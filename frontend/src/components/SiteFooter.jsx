import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-brand-900">TalentMatch</p>
          <p>Nền tảng tuyển dụng thông minh.</p>
        </div>
        <nav className="flex gap-4">
          <Link to="/" className="hover:text-brand-600">
            Trang chủ
          </Link>
          <Link to="/jobs" className="hover:text-brand-600">
            Việc làm
          </Link>
        </nav>
      </div>
    </footer>
  );
}
