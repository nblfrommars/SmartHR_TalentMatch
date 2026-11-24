import { Link, NavLink } from "react-router-dom";

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
  }`;

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">T</span>
          TalentMatch
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/jobs" className={navClass}>
            Việc làm
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
