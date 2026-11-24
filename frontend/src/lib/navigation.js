/** Liên kết theo vai trò (dùng cho menu tài khoản và thanh bên). */
export function roleLinks(hasRole) {
  const links = [];
  if (hasRole("USER")) {
    links.push(
      { to: "/me", label: "Tổng quan" },
      { to: "/me/cv", label: "Hồ sơ CV" },
      { to: "/me/applications", label: "Đơn ứng tuyển" },
    );
  }
  if (hasRole("HR")) {
    links.push({ to: "/hr/jobs", label: "Tin tuyển dụng" }, { to: "/hr/jobs/new", label: "Đăng tin mới" });
  }
  if (hasRole("ADMIN")) {
    links.push({ to: "/admin/users", label: "Người dùng" }, { to: "/admin/positions", label: "Vị trí" });
  }
  return links;
}

/** Trang mặc định sau khi đăng nhập, theo vai trò. */
export function homeFor(hasRole) {
  if (hasRole("HR")) return "/hr/jobs";
  if (hasRole("ADMIN")) return "/admin/users";
  if (hasRole("USER")) return "/me";
  return "/";
}
