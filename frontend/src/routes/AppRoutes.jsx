import { Route, Routes } from "react-router-dom";
import AdminPositions from "../pages/AdminPositions";
import AdminUsers from "../pages/AdminUsers";
import Home from "../pages/Home";
import HrApplicants from "../pages/HrApplicants";
import HrJobEditor from "../pages/HrJobEditor";
import HrJobs from "../pages/HrJobs";
import JobDetail from "../pages/JobDetail";
import Jobs from "../pages/Jobs";
import Login from "../pages/Login";
import MyApplications from "../pages/MyApplications";
import MyCv from "../pages/MyCv";
import MyDashboard from "../pages/MyDashboard";
import NotFound from "../pages/NotFound";
import Notifications from "../pages/Notifications";
import Register from "../pages/Register";
import RequireRole from "./RequireRole";

const guard = (roles, element) => <RequireRole roles={roles}>{element}</RequireRole>;

export default function AppRoutes() {
  return (
    <Routes>
      {/* Công khai */}
      <Route path="/" element={<Home />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/jobs/:id" element={<JobDetail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Ứng viên */}
      <Route path="/me" element={guard(["USER"], <MyDashboard />)} />
      <Route path="/me/cv" element={guard(["USER"], <MyCv />)} />
      <Route path="/me/applications" element={guard(["USER"], <MyApplications />)} />

      {/* Nhà tuyển dụng */}
      <Route path="/hr/jobs" element={guard(["HR"], <HrJobs />)} />
      <Route path="/hr/jobs/new" element={guard(["HR"], <HrJobEditor />)} />
      <Route path="/hr/jobs/:id/edit" element={guard(["HR"], <HrJobEditor />)} />
      <Route path="/hr/jobs/:id/applicants" element={guard(["HR"], <HrApplicants />)} />

      {/* Mọi tài khoản đã đăng nhập */}
      <Route path="/notifications" element={guard(null, <Notifications />)} />

      {/* Quản trị */}
      <Route path="/admin/users" element={guard(["ADMIN"], <AdminUsers />)} />
      <Route path="/admin/positions" element={guard(["ADMIN"], <AdminPositions />)} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
