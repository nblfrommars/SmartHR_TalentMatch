
import { Link } from "react-router-dom";

export function Field({ label, htmlFor, error, hint, required, children, className = "" }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-700">
          {label}
          {required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      )}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-card ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold text-zinc-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const buttonTones = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200",
  secondary: "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 disabled:opacity-50",
};

const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };
const buttonBase = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition";

export function Button({ tone = "primary", size = "md", className = "", busy, children, ...props }) {
  return (
    <button
      type="button"
      disabled={busy || props.disabled}
      className={`${buttonBase} ${buttonSizes[size]} ${buttonTones[tone]} ${className}`}
      {...props}
    >
      {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/** Link trông giống Button (cùng chiều cao), để đặt cạnh Button không bị lệch hàng. */
export function ButtonLink({ to, tone = "primary", size = "md", className = "", children, ...props }) {
  return (
    <Link to={to} className={`${buttonBase} ${buttonSizes[size]} ${buttonTones[tone]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
