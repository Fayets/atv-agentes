import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Building2,
  FileText,
  KeyRound,
  LogOut,
  PanelLeft,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api";
import { findAgent } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import CommandPalette from "@/components/CommandPalette";
import AgentWorkspace from "@/components/agent/AgentWorkspace";
import { cn } from "@/lib/utils";
import "@/components/agent/agent-workspace.css";
import "@/components/agent/agent-surfaces.css";

/**
 * Cáscara de la app: barra lateral agrupada, ⌘K, y el workspace de un
 * agente como capa encima de cualquier pantalla (?agent=mk1&session=12).
 */
export default function AppShell({ children }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate("/login");
  }

  const id = clientId || user?.client_id || "c1";
  const base = `/dashboard/${id}`;
  const path = location.pathname;
  const is = (suffix) => (suffix ? path.startsWith(`${base}/${suffix}`) : path === base);

  const groups = [
    {
      label: null,
      items: [{ to: base, label: "Inicio", icon: Sparkles, active: is("") }],
    },
    {
      label: "Agentes",
      items: [
        { to: `${base}/plantel`, label: "Plantel", icon: Users, active: is("plantel") },
        { to: `${base}/agentes`, label: "Documentos", icon: FileText, active: is("agentes") },
      ],
    },
    {
      label: "Recursos",
      items: [
        { to: `${base}/estilo`, label: "Estilo", icon: BookOpen, active: is("estilo") },
        { to: `${base}/conexion`, label: "Conexión", icon: KeyRound, active: is("conexion") },
        ...(user?.role === "superadmin"
          ? [{ to: "/clients", label: "Clientes", icon: Building2, active: path === "/clients" }]
          : []),
      ],
    },
  ];

  // workspace como capa: ?agent=mk1[&session=12]
  const agentParam = searchParams.get("agent");
  const sessionParam = searchParams.get("session");
  const found = agentParam ? findAgent(agentParam) : null;
  const closeAgent = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("agent");
    next.delete("session");
    setSearchParams(next, { replace: true });
  };

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
            ? cn("fixed inset-y-0 left-0 w-64", open ? "translate-x-0" : "-translate-x-full")
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

        <nav className="flex flex-1 flex-col px-2 py-2">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {g.label && (open || mobile) ? <p className="nav-group">{g.label}</p> : null}
              {g.label && !(open || mobile) ? <div className="my-2 h-px bg-white/8" /> : null}
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => mobile && setOpen(false)}
                    title={item.label}
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
            </div>
          ))}
        </nav>

        {user ? (
          <div className="border-t border-white/8 p-3">
            {(open || mobile) && (
              <div className="mb-2 px-1">
                <p className="truncate text-xs text-white/40">{user.username || user.email}</p>
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
          <Button variant="ghost" size="icon" aria-label="Menú" onClick={() => setOpen((v) => !v)}>
            <PanelLeft className="size-4" />
          </Button>
          <span className="text-sm text-white/50">Grounded</span>
          <div className="ml-auto">
            <button
              type="button"
              className="cmdk-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Buscar agente o pantalla"
            >
              <Search className="size-3.5" />
              <span className="hidden sm:inline">Buscar agente…</span>
              <kbd>⌘</kbd>
              <kbd>K</kbd>
            </button>
          </div>
        </header>
        <main className="app-shell__main">
          <div className="app-shell__fill">{children}</div>
        </main>
      </div>

      {found ? (
        <AgentWorkspace
          key={`${found.agent.id}-${sessionParam || ""}`}
          agent={found.agent}
          category={found.category}
          initialSessionId={sessionParam ? Number(sessionParam) : null}
          onClose={closeAgent}
        />
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        clientId={id}
        isSuperadmin={user?.role === "superadmin"}
      />
    </div>
  );
}
