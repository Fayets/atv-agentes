import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import RosterPage from "./pages/RosterPage";
import TonePage from "./pages/TonePage";
import AgentsPage from "./pages/AgentsPage";
import ConnectionsPage from "./pages/ConnectionsPage";
import ClientsPage from "./pages/ClientsPage";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "superadmin") return <Navigate to="/clients" replace />;
  return <Navigate to={`/dashboard/${user.client_id || "c1"}`} replace />;
}

const BOTH = ["superadmin", "client_admin"];

function guarded(element, roles = BOTH) {
  return <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/clients" element={guarded(<ClientsPage />, ["superadmin"])} />
          <Route path="/dashboard/:clientId" element={guarded(<HomePage />)} />
          <Route path="/dashboard/:clientId/plantel" element={guarded(<RosterPage />)} />
          <Route path="/dashboard/:clientId/estilo" element={guarded(<TonePage />)} />
          <Route path="/dashboard/:clientId/agentes" element={guarded(<AgentsPage />)} />
          <Route path="/dashboard/:clientId/conexion" element={guarded(<ConnectionsPage />)} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
