import { useNavigate, useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { AgentAvatar } from "@/components/agent/AgentAvatar";
import { useAgentCatalog } from "@/hooks/use-agent-catalog";
import { CATEGORIES } from "@/lib/api";
import { AGENT_ROLES, categoryColor, categoryLabel } from "@/lib/agents";
import { cn } from "@/lib/utils";
import "@/components/agent/agent-surfaces.css";

export default function RosterPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { agents, error } = useAgentCatalog();

  const open = (a) => navigate({ search: `?agent=${a.id}` });
  const edit = (a) => navigate(`/dashboard/${clientId}/agentes?edit=${a.id}`);

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="page-head">
          <div>
            <p className="ws-kicker">Agentes</p>
            <h1>Plantel</h1>
            <p>Cuatro áreas, catorce integrantes. Cada uno hace una sola cosa.</p>
          </div>
        </div>
        {error ? <p className="px-7 pt-4 text-sm text-red-400">{error}</p> : null}
        <div className="roster">
          {CATEGORIES.map((cat) => {
            const list = agents.filter((a) => a.category === cat);
            return (
              <section key={cat} style={{ "--c": categoryColor(cat) }}>
                <div className="roster__dep">
                  <h2>{categoryLabel(cat)}</h2>
                  <small>{list.length} {list.length === 1 ? "agente" : "agentes"}</small>
                </div>
                <div className="team">
                  {list.map((a) => {
                    const hasDoc = a.has_prompt !== false;
                    return (
                      <article key={a.id} className={cn("member", !hasDoc && "is-off")}>
                        <div className="member__face">
                          <AgentAvatar icon={a.icon} category={a.category} size={52} glow={hasDoc} />
                        </div>
                        <h3 className="member__name">{a.name}</h3>
                        <p className="member__role">{AGENT_ROLES[a.id] || ""}</p>
                        <div className="member__meta">
                          <span className={cn("ws-chip", !hasDoc && "no")}>{hasDoc ? "documento" : "sin documento"}</span>
                          {a.examples != null ? <span className="ws-chip ws-mono">{a.examples} ej.</span> : null}
                        </div>
                        <button
                          type="button"
                          className="member__ask"
                          onClick={() => (hasDoc ? open(a) : edit(a))}
                        >
                          {hasDoc ? "Pedirle algo" : "Cargar documento"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
