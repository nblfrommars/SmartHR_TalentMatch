import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function PublicLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
