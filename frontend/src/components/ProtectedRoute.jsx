import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/*
 * ADVERTENCIA: esta protección es solo UX.
 * El límite de seguridad real lo va a poner FastAPI validando JWT + role + client_id
 * en cada request cuando construyamos esa parte — acá todavía no existe.
 */

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const { clientId } = useParams();

  if (loading) {
    return (
      <div className="page-center">
        <div className="spinner" aria-label="Cargando" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === "client_admin" && user.client_id) {
      return <Navigate to={`/dashboard/${user.client_id}`} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  if (
    clientId &&
    user.role === "client_admin" &&
    user.client_id &&
    clientId !== user.client_id
  ) {
    return <Navigate to={`/dashboard/${user.client_id}`} replace />;
  }

  return children;
}
