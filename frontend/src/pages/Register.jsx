import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import keycloak from "../auth/keycloak";
import { useAuth } from "../auth/useAuth";

export default function Register() {
  const { authenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    userName: "",
    email: "",
    password: "",
    fullName: "",
    role: "USER",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authenticated) navigate("/dashboard", { replace: true });
  }, [authenticated, navigate]);

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const body = {
      userName: form.userName,
      email: form.email,
      password: form.password,
      fullName: form.fullName || null,
      role: form.role,
    };
    try {
      const response = await fetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(response.status === 409 ? "Username hoặc email đã tồn tại." : "Không thể đăng ký tài khoản.");
      }
      await keycloak.login({ loginHint: form.email });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 rounded-2xl bg-white/10 p-8 shadow-xl">
        <div><p className="text-sm text-cyan-300">SmartHR</p><h1 className="mt-2 text-3xl font-bold">Tạo tài khoản</h1></div>
        <input name="userName" required minLength="3" placeholder="Username" value={form.userName} onChange={update} className="field" />
        <input name="email" required type="email" placeholder="Email" value={form.email} onChange={update} className="field" />
        <input name="password" required type="password" placeholder="Mật khẩu" value={form.password} onChange={update} className="field" />
        <input name="fullName" placeholder="Họ và tên" value={form.fullName} onChange={update} className="field" />
        <select name="role" value={form.role} onChange={update} className="field"><option value="USER">Ứng viên</option><option value="HR">HR freelance</option></select>
        <p className="text-sm text-slate-400">Bạn có thể bổ sung thông tin CV hoặc công ty trong phần profile sau khi đăng nhập.</p>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button disabled={submitting} className="button w-full">{submitting ? "Đang đăng ký..." : "Đăng ký"}</button>
        <p className="text-center text-sm text-slate-300">Đã có tài khoản? <Link to="/login" className="text-cyan-300">Đăng nhập</Link></p>
      </form>
    </main>
  );
}
