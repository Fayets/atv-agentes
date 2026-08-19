import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EntriesPage from "./pages/EntriesPage";
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/clients"
            element={
              <ProtectedRoute roles={["superadmin"]}>
                <ClientsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:clientId"
            element={
              <ProtectedRoute roles={["superadmin", "client_admin"]}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:clientId/entries"
            element={
              <ProtectedRoute roles={["superadmin", "client_admin"]}>
                <EntriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:clientId/estilo"
            element={
              <ProtectedRoute roles={["superadmin", "client_admin"]}>
                <TonePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:clientId/agentes"
            element={
              <ProtectedRoute roles={["superadmin", "client_admin"]}>
                <AgentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/:clientId/conexion"
            element={
              <ProtectedRoute roles={["superadmin", "client_admin"]}>
                <ConnectionsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
