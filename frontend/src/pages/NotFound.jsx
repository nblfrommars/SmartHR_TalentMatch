import { Link } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";

export default function NotFound() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-6xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-zinc-500">Đường dẫn không tồn tại hoặc đã bị thay đổi.</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">
          Về trang chủ
        </Link>
      </div>
    </PublicLayout>
  );
}
