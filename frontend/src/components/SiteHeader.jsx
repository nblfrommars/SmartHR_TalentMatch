import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { ROLE_LABELS } from "../lib/format";
import { roleLinks } from "../lib/navigation";
import NotificationBell from "./NotificationBell";

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
  }`;

function AccountMenu() {
  const { user, roles, hasRole, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const role = ["ADMIN", "HR", "USER"].find((r) => roles.includes(r));
  const initial = (user?.name || "?").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-zinc-200 py-1 pl-1 pr-3 text-sm hover:bg-zinc-50"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 font-bold text-white">{initial}</span>
        <span className="hidden max-w-32 truncate font-medium text-zinc-800 sm:block">{user?.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card-hover">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="truncate font-semibold text-zinc-900">{user?.name}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
            {role && <p className="mt-1 text-xs font-medium text-brand-700">{ROLE_LABELS[role]}</p>}
          </div>
          <nav className="py-1">
            {roleLinks(hasRole).map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={logout}
            className="w-full border-t border-zinc-100 px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  const { ready, authenticated, hasRole, login } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">T</span>
            TalentMatch
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/jobs" className={navClass}>
              Việc làm
            </NavLink>
            {authenticated && hasRole("USER") && (
              <NavLink to="/me/applications" className={navClass}>
                Đơn ứng tuyển
              </NavLink>
            )}
            {authenticated && hasRole("HR") && (
              <NavLink to="/hr/jobs" className={navClass}>
                Nhà tuyển dụng
              </NavLink>
            )}
            {authenticated && hasRole("ADMIN") && (
              <NavLink to="/admin/users" className={navClass}>
                Quản trị
              </NavLink>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <NavLink to="/jobs" className={(state) => `${navClass(state)} md:hidden`}>
            Việc làm
          </NavLink>
          {!ready && <span className="h-8 w-24 animate-pulse rounded-full bg-zinc-100" />}
          {ready && authenticated && (
            <>
              <NotificationBell />
              <AccountMenu />
            </>
          )}
          {ready && !authenticated && (
            <>
              <button
                type="button"
                onClick={() => login()}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Đăng nhập
              </button>
              <Link
                to="/register"
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
