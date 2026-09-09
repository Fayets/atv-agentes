import { ArrowUpRight } from "lucide-react";
import { AgentAvatar } from "@/components/agent/AgentAvatar";
import { AGENT_ROLES, categoryColor, categoryLabel } from "@/lib/agents";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de un agente para el inicio. Tres filas de altura fija —
 * eyebrow, título, acción + ícono — para que todas las tarjetas midan lo
 * mismo y nada se pise.
 */
export function AgentCard({ agent, onOpen, onEdit }) {
  const hasDoc = agent.has_prompt !== false;
  const color = categoryColor(agent.category);
  return (
    <article className={cn("acard", !hasDoc && "is-off")} style={{ "--c": color }}>
      <button
        type="button"
        className="acard__visual"
        onClick={() => (hasDoc ? onOpen?.(agent) : onEdit?.(agent))}
        aria-label={hasDoc ? `Abrir ${agent.name}` : `${agent.name} no tiene documento. Cargarlo.`}
      >
        <span className="acard__top">
          <span className="acard__eyebrow">{categoryLabel(agent.category)}</span>
          <span className="acard__id">{agent.id}</span>
        </span>
        <h3 className="acard__title">{agent.name}</h3>
        <span className="acard__bottom">
          <span className="acard__play">
            {hasDoc ? <ArrowUpRight className="size-4" /> : "Sin documento"}
          </span>
          <span className="acard__glyph">
            <AgentAvatar icon={agent.icon} category={agent.category} size={36} />
          </span>
        </span>
      </button>
      <footer className="acard__foot">
        <p className="acard__role">{AGENT_ROLES[agent.id] || ""}</p>
        <div className="acard__meta">
          <span className={cn("ws-chip", !hasDoc && "no")}>{hasDoc ? "documento" : "falta el documento"}</span>
          {agent.examples != null ? (
            <span className="ws-chip ws-mono">{agent.examples} ej.</span>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
