import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Building2, CornerDownLeft, FileText, KeyRound, Search, Sparkles, Users } from "lucide-react";
import { AgentAvatar } from "@/components/agent/AgentAvatar";
import { allAgents, categoryLabel } from "@/lib/agents";
import { cn } from "@/lib/utils";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * ⌘K — abrir cualquier agente o pantalla escribiendo. Patrón Raycast/Linear:
 * filas compactas, navegación por teclado, una sola línea de búsqueda.
 */
export default function CommandPalette({ open, onClose, clientId, isSuperadmin = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const items = useMemo(() => {
    const id = clientId || "c1";
    const pages = [
      { kind: "page", id: "p-home", label: "Inicio", hint: "Ir a", icon: Sparkles, to: `/dashboard/${id}` },
      { kind: "page", id: "p-roster", label: "Plantel", hint: "Ir a", icon: Users, to: `/dashboard/${id}/plantel` },
      { kind: "page", id: "p-agentes", label: "Documentos de agentes", hint: "Ir a", icon: FileText, to: `/dashboard/${id}/agentes` },
      { kind: "page", id: "p-estilo", label: "Estilo · tono de voz", hint: "Ir a", icon: BookOpen, to: `/dashboard/${id}/estilo` },
      { kind: "page", id: "p-conexion", label: "Conexión · Claude y Apify", hint: "Ir a", icon: KeyRound, to: `/dashboard/${id}/conexion` },
      ...(isSuperadmin
        ? [{ kind: "page", id: "p-clientes", label: "Clientes", hint: "Ir a", icon: Building2, to: "/clients" }]
        : []),
    ];
    // Un agente se abre como capa sobre la pantalla actual; si estamos fuera
    // del dashboard, primero vamos al inicio.
    const onDashboard = location.pathname.startsWith("/dashboard/");
    const agents = allAgents().map((a) => ({
      kind: "agent",
      id: a.id,
      label: a.name,
      hint: categoryLabel(a.category),
      icon: a.icon,
      category: a.category,
      to: { pathname: onDashboard ? location.pathname : `/dashboard/${id}`, search: `?agent=${a.id}` },
    }));
    return [...agents, ...pages];
  }, [clientId, isSuperadmin, location.pathname]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((it) =>
      normalize(`${it.label} ${it.hint} ${it.id}`).includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (item) => {
    if (!item) return;
    onClose?.();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    }
  };

  const agentsShown = filtered.filter((i) => i.kind === "agent");
  const pagesShown = filtered.filter((i) => i.kind === "page");
  let runningIndex = -1;

  const renderRow = (item) => {
    runningIndex += 1;
    const index = runningIndex;
    const isActive = index === active;
    const PageIcon = item.kind === "page" ? item.icon : null;
    return (
      <button
        key={item.id}
        type="button"
        data-index={index}
        className={cn("cmdk-row", isActive && "is-active")}
        onMouseEnter={() => setActive(index)}
        onClick={() => go(item)}
      >
        {item.kind === "agent" ? (
          <AgentAvatar icon={item.icon} category={item.category} size={26} />
        ) : (
          <span className="cmdk-row__page">{PageIcon ? <PageIcon className="size-3.5" /> : null}</span>
        )}
        <span className="cmdk-row__label">{item.label}</span>
        <span className="cmdk-row__hint">{item.hint}</span>
        {isActive ? <CornerDownLeft className="size-3.5 text-white/40" /> : null}
      </button>
    );
  };

  return (
    <div className="cmdk-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar agente o pantalla"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk__input">
          <Search className="size-4 text-white/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar agente o pantalla…"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>

        <div className="cmdk__list" ref={listRef}>
          {filtered.length === 0 ? (
            <p className="cmdk__empty">Nada con “{query}”.</p>
          ) : null}
          {agentsShown.length ? <p className="cmdk__group">Agentes</p> : null}
          {agentsShown.map(renderRow)}
          {pagesShown.length ? <p className="cmdk__group">Pantallas</p> : null}
          {pagesShown.map(renderRow)}
        </div>

        <div className="cmdk__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
