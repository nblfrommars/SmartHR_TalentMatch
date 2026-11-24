import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import HRLayout from "../layouts/HRLayout";
import UserLayout from "../layouts/UserLayout";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Dashboard from "../pages/Dashboard";
import Profile from "../pages/Profile";

function ProtectedRoute({ children }) {
  const { authenticated, login } = useAuth();
  if (!authenticated) return <button onClick={() => login()} className="button">Đăng nhập</button>;
  return children;
}

export default function AppRoutes() {
  const { roles } = useAuth();
  const home = roles.includes("HR") ? <HRLayout /> : <UserLayout />;
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/legacy-home" element={<ProtectedRoute>{home}</ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
