import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  FileText,
  KeyRound,
  LogOut,
  Map,
  PanelLeft,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dashboard Sidebar — paleta Charcoal Ink (21st.dev/@arunjdass).
 */
export default function AppShell({ children, onUpload, extra }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId } = useParams();
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      setMobile(mq.matches);
      setOpen(!mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate("/login");
  }

  const id = clientId || user?.client_id || "c1";
  const mapHref = `/dashboard/${id}`;
  const entriesHref = `/dashboard/${id}/entries`;
  const estiloHref = `/dashboard/${id}/estilo`;
  const agentesHref = `/dashboard/${id}/agentes`;
  const conexionHref = `/dashboard/${id}/conexion`;
  const isMap = location.pathname === mapHref;
  const isEntries = location.pathname.startsWith(entriesHref);
  const isEstilo = location.pathname.startsWith(estiloHref);
  const isAgentes = location.pathname.startsWith(agentesHref);
  const isConexion = location.pathname.startsWith(conexionHref);

  const nav = [
    { to: mapHref, label: "Mapa", icon: Map, active: isMap && !isEntries && !isEstilo && !isAgentes && !isConexion },
    { to: entriesHref, label: "Entries", icon: FileText, active: isEntries },
    { to: estiloHref, label: "Estilo", icon: BookOpen, active: isEstilo },
    { to: agentesHref, label: "Agentes", icon: Sparkles, active: isAgentes },
    { to: conexionHref, label: "Claude", icon: KeyRound, active: isConexion },
    ...(user?.role === "superadmin"
      ? [{ to: "/clients", label: "Clientes", icon: Users, active: location.pathname === "/clients" }]
      : []),
  ];

  return (
    <div className="app-shell">
      {mobile && open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "z-40 flex h-full shrink-0 flex-col border-r border-white/8 bg-[#0a0a0a] transition-[width,transform] duration-200",
          mobile
            ? cn(
                "fixed inset-y-0 left-0 w-64",
                open ? "translate-x-0" : "-translate-x-full"
              )
            : open
              ? "w-60"
              : "w-[68px]"
        )}
      >
        <div className="flex h-14 items-center gap-2.5 px-3">
          <img
            src="/atv-logo.png"
            alt=""
            width={28}
            height={28}
            className="size-7 object-contain [filter:hue-rotate(-28deg)_saturate(1.25)_brightness(0.95)]"
          />
          {open || mobile ? (
            <span className="truncate text-sm font-semibold tracking-wide text-primary">
              Grounded ATV
            </span>
          ) : null}
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => mobile && setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  item.active
                    ? "bg-primary/15 text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {open || mobile ? <span>{item.label}</span> : null}
              </Link>
            );
          })}

          {onUpload ? (
            <button
              type="button"
              onClick={() => {
                onUpload();
                if (mobile) setOpen(false);
              }}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Upload className="size-4 shrink-0" />
              {open || mobile ? <span>Cargar</span> : null}
            </button>
          ) : null}

          {extra && (open || mobile) ? <div className="mt-2 px-1">{extra}</div> : null}
        </nav>

        {user ? (
          <div className="border-t border-white/8 p-3">
            {(open || mobile) && (
              <div className="mb-2 px-1">
                <p className="truncate text-xs text-white/40">{user.email}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/30">
                  {user.role}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size={open || mobile ? "sm" : "icon"}
              className="w-full justify-start text-white/55 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="size-4" />
              {open || mobile ? "Salir" : null}
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="app-shell__body">
        <header className="app-shell__header">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menú"
            onClick={() => setOpen((v) => !v)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="text-sm text-white/50">Grounded</span>
        </header>
        <main className="app-shell__main">
          <div className="app-shell__fill">{children}</div>
        </main>
      </div>
    </div>
  );
}
