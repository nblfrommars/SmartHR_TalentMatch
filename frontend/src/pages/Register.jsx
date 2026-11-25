import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Button, Field } from "../components/Form";
import PublicLayout from "../components/PublicLayout";
import { ApiError } from "../lib/api";
import { GENDER_LABELS } from "../lib/format";
import { useToast } from "../lib/toastContext";
import { inputClass } from "../lib/ui";
import { userApi } from "../lib/userApi";

const EMPTY = {
  userName: "",
  email: "",
  password: "",
  confirm: "",
  fullName: "",
  gender: "NOINFO",
  dob: "",
  role: "USER",
};

const today = () => new Date().toISOString().slice(0, 10);

function validate(form) {
  const errors = {};
  if (form.userName.trim().length < 3) errors.userName = "Tối thiểu 3 ký tự";
  if (/\s/.test(form.userName.trim())) errors.userName = "Không được chứa khoảng trắng";
  if (form.dob && form.dob >= today()) errors.dob = "Ngày sinh phải trước hôm nay";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Email không hợp lệ";
  if (form.password.length < 8) errors.password = "Tối thiểu 8 ký tự";
  if (form.confirm !== form.password) errors.confirm = "Mật khẩu nhập lại không khớp";
  return errors;
}

export default function Register() {
  const { ready, authenticated, login } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (ready && authenticated) return <Navigate to="/login" replace />;

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await userApi.register({
        userName: form.userName.trim(),
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim() || null,
        gender: form.gender,
        dob: form.dob || null, // "yyyy-MM-dd"
        role: form.role,
      });
      toast.success("Tạo tài khoản thành công. Đang chuyển sang trang đăng nhập...");
      setTimeout(
        () => login({ loginHint: form.email.trim(), redirectUri: `${window.location.origin}/login` }),
        800,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ userName: "Username hoặc email đã được sử dụng" });
      } else if (error instanceof ApiError && error.status === 502) {
        toast.error("Không tạo được tài khoản: api-gateway, user-service hoặc Keycloak chưa phản hồi. Vui lòng thử lại sau.");
      } else {
        setErrors(error instanceof ApiError ? error.fieldErrors() : {});
        toast.error(error);
      }
      setBusy(false);
    }
  }

  const input = (key, props = {}) => (
    <input id={`reg-${key}`} value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} className={inputClass} {...props} />
  );

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-12">
        <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-card">
          <div>
            <h1 className="text-2xl font-extrabold text-zinc-900">Tạo tài khoản</h1>
            <p className="mt-1 text-sm text-zinc-500">Tham gia TalentMatch để tìm việc hoặc đăng tin tuyển dụng.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
            {[
              ["USER", "Tôi là ứng viên"],
              ["HR", "Tôi là nhà tuyển dụng"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, role: value }))}
                className={`rounded-lg px-3 py-2 transition ${form.role === value ? "bg-white text-brand-700 shadow-card" : "text-zinc-600"}`}
                aria-pressed={form.role === value}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Username" htmlFor="reg-userName" required error={errors.userName}>
            {input("userName", { autoComplete: "username" })}
          </Field>
          <Field label="Email" htmlFor="reg-email" required error={errors.email}>
            {input("email", { type: "email", autoComplete: "email" })}
          </Field>
          <Field label="Họ và tên" htmlFor="reg-fullName" error={errors.fullName}>
            {input("fullName", { autoComplete: "name" })}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giới tính" htmlFor="reg-gender" error={errors.gender}>
              <select id="reg-gender" value={form.gender} onChange={set("gender")} className={inputClass}>
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày sinh" htmlFor="reg-dob" error={errors.dob}>
              {input("dob", { type: "date", max: today() })}
            </Field>
          </div>
          <Field label="Mật khẩu" htmlFor="reg-password" required error={errors.password}>
            {input("password", { type: "password", autoComplete: "new-password" })}
          </Field>
          <Field label="Nhập lại mật khẩu" htmlFor="reg-confirm" required error={errors.confirm}>
            {input("confirm", { type: "password", autoComplete: "new-password" })}
          </Field>

          <Button type="submit" busy={busy} className="w-full">
            Đăng ký
          </Button>
          <p className="text-center text-sm text-zinc-500">
            Đã có tài khoản?{" "}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </PublicLayout>
  );
}
