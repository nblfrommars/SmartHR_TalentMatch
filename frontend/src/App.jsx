import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import Home from "./pages/Home";
import JobDetail from "./pages/JobDetail";
import Jobs from "./pages/Jobs";
import AppRoutes from "./routes/AppRoutes";

// Trang công khai nằm ngoài AuthProvider để không phải chờ Keycloak khởi tạo.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="*" element={<AuthProvider><AppRoutes /></AuthProvider>} />
      </Routes>
    </BrowserRouter>
  );
}
