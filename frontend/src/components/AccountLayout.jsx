import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import PublicLayout from "./PublicLayout";
import { roleLinks } from "../lib/navigation";

const linkClass = ({ isActive }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
  }`;

/** Khung trang cho USER / HR / ADMIN: thanh bên + nội dung. */
export default function AccountLayout({ title, subtitle, actions, children }) {
  const { hasRole } = useAuth();
  const links = roleLinks(hasRole);

  return (
    <PublicLayout>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[14rem_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 rounded-xl border border-zinc-200 bg-white p-3 shadow-card">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <nav className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
                    isActive ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-200 bg-white text-zinc-700"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-zinc-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </section>
      </div>
    </PublicLayout>
  );
}
