const tones = {
  neutral: "bg-zinc-100 text-zinc-700",
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-600",
  danger: "bg-red-50 text-red-600",
};

export default function Badge({ children, tone = "neutral" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
