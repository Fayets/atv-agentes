import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import AppShell from "@/components/AppShell";
import { AgentCard } from "@/components/agent/AgentCard";
import { AIInput } from "@/components/kokonut/ai-input";
import { useAuth } from "@/context/AuthContext";
import { useAgentCatalog } from "@/hooks/use-agent-catalog";
import {
  CATEGORIES,
  getApifyStatus,
  getClaudeStatus,
  getClientById,
  listAgentSessions,
} from "@/lib/api";
import { categoryColor, categoryLabel } from "@/lib/agents";
import { setPendingDraft } from "@/lib/draft-store";
import { documentError, fileToApiAttachment, readDocumentFile } from "@/lib/read-document";
import { cn } from "@/lib/utils";
import "@/components/agent/agent-surfaces.css";

let attachSeq = 0;

function relDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default function HomePage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agents, error } = useAgentCatalog();
  const clientName = getClientById(clientId)?.name || clientId || "Cliente";
  const rawWho = (user?.username || user?.email || "").split("@")[0] || "Juan";
  const who = rawWho.charAt(0).toUpperCase() + rawWho.slice(1);

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState("");
  const [agentId, setAgentId] = useState("");
  const [hint, setHint] = useState(false);
  const [filter, setFilter] = useState("all");
  const [recent, setRecent] = useState(null);
  const [conn, setConn] = useState({ claude: null, apify: null });
  const pickRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getClaudeStatus().catch(() => null), getApifyStatus().catch(() => null)]).then(
      ([claude, apify]) => alive && setConn({ claude, apify })
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all(
      agents.map((a) =>
        listAgentSessions(clientId, a.id)
          .then((d) => (d?.sessions || []).map((s) => ({ ...s, agent: a })))
          .catch(() => [])
      )
    ).then((lists) => {
      if (!alive) return;
      const all = lists.flat().sort((x, y) => new Date(y.updated_at) - new Date(x.updated_at));
      setRecent(all.slice(0, 6));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const counts = useMemo(() => {
    const c = { all: agents.length };
    CATEGORIES.forEach((cat) => {
      c[cat] = agents.filter((a) => a.category === cat).length;
    });
    return c;
  }, [agents]);

  const shown = filter === "all" ? agents : agents.filter((a) => a.category === filter);
  const withDoc = agents.filter((a) => a.has_prompt === true);
  const withoutDoc = agents.filter((a) => a.has_prompt === false);
  const totalExamples = agents.reduce((n, a) => n + (a.examples || 0), 0);
  const loaded = agents.some((a) => a.has_prompt !== null);

  const openAgent = (a, extra = "") => navigate({ search: `?agent=${a.id}${extra}` });
  const editAgent = (a) => navigate(`/dashboard/${clientId}/agentes?edit=${a.id}`);

  const addFiles = (files) => {
    const next = [];
    let err = "";
    for (const file of files) {
      const msg = documentError(file);
      if (msg) {
        err = msg;
        continue;
      }
      next.push({ id: `f-${Date.now()}-${attachSeq++}`, name: file.name, file });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 5));
    setAttachError(err);
  };

  const send = async (value) => {
    const text = (value ?? draft).trim();
    if (!text && !attachments.length) return;
    if (!agentId) {
      setHint(true);
      pickRef.current?.focus();
      setTimeout(() => setHint(false), 1800);
      return;
    }
    const agent = agents.find((a) => a.id === agentId);
    const apiFiles = [];
    const bodies = [];
    for (const item of attachments) {
      const pdf = await fileToApiAttachment(item.file);
      if (pdf) {
        apiFiles.push(pdf);
        continue;
      }
      const extracted = await readDocumentFile(item.file);
      bodies.push(`--- ${item.name} ---\n${extracted}`);
    }
    const preview = [text, ...attachments.map((i) => `📎 ${i.name}`)].filter(Boolean).join("\n");
    const payload = [text, ...bodies].filter(Boolean).join("\n\n");
    setPendingDraft({ text: payload, preview, files: apiFiles });
    setDraft("");
    setAttachments([]);
    openAgent(agent);
  };

  const picked = agents.find((a) => a.id === agentId);

  return (
    <AppShell>
      <div className="home">
        <div className="home__grid">
          <section>
            <div className="home__hero">
              <h1>Hola, {who}</h1>
              <p>
                {clientName} · {agents.length} agentes
                {loaded ? ` · ${withDoc.length} listos para trabajar` : ""}
              </p>
            </div>

            <div className="composer">
              <AIInput
                id="home-composer"
                value={draft}
                onChange={setDraft}
                onSubmit={send}
                placeholder="Contá qué necesitás: pegá el brief, una transcripción o un enlace…"
                minHeight={72}
                maxHeight={220}
                attachments={attachments}
                onAttach={addFiles}
                onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((i) => i.id !== id))}
              />
              {attachError ? <p className="mb-1 px-3 text-xs text-red-400">{attachError}</p> : null}
              <div className="composer__bar">
                <label className={cn("composer__pick", !agentId && "is-empty", hint && "is-hint")}>
                  {picked ? (
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: categoryColor(picked.category) }}
                    />
                  ) : null}
                  <span>{picked ? picked.name : "Elegí un agente"}</span>
                  <ChevronDown className="size-3.5 opacity-60" />
                  <select
                    ref={pickRef}
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    aria-label="Agente"
                  >
                    <option value="">Elegí un agente</option>
                    {CATEGORIES.map((cat) => (
                      <optgroup key={cat} label={categoryLabel(cat)}>
                        {agents
                          .filter((a) => a.category === cat)
                          .map((a) => (
                            <option key={a.id} value={a.id} disabled={a.has_prompt === false}>
                              {a.name}
                              {a.has_prompt === false ? " · sin documento" : ""}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <span className="composer__hint">
                  <kbd>↵</kbd> envía · <kbd>⇧</kbd><kbd>↵</kbd> salto de línea
                </span>
              </div>
            </div>

            <div className="chips" role="tablist" aria-label="Filtrar por área">
              <button
                type="button"
                className={cn("chip-btn", filter === "all" && "is-on")}
                onClick={() => setFilter("all")}
              >
                Todos <b>{counts.all}</b>
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cn("chip-btn", filter === cat && "is-on")}
                  style={{ "--c": categoryColor(cat) }}
                  onClick={() => setFilter(cat)}
                >
                  <i /> {categoryLabel(cat)} <b>{counts[cat]}</b>
                </button>
              ))}
            </div>

            {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

            <div className="cards">
              {shown.map((a) => (
                <AgentCard key={a.id} agent={a} onOpen={openAgent} onEdit={editAgent} />
              ))}
            </div>
          </section>

          <aside>
            <div className="desk">
              <div className="desk__head">Estado del equipo</div>
              <div className="desk__body">
                {loaded ? (
                  <>
                    <p>
                      <strong>{withDoc.length} de {agents.length}</strong> agentes tienen su documento
                      de proceso y <strong>{totalExamples}</strong> ejemplos cargados en total.
                    </p>
                    {withoutDoc.length ? (
                      <>
                        <p>Faltan {withoutDoc.length}. Hasta que tengan documento no pueden correr:</p>
                        <ul className="desk__list">
                          {withoutDoc.map((a) => (
                            <li key={a.id} style={{ "--c": categoryColor(a.category) }}>
                              <Link to={`/dashboard/${clientId}/agentes?edit=${a.id}`}>
                                <i />
                                {a.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p>Los 14 tienen documento.</p>
                    )}
                  </>
                ) : (
                  <p>Leyendo el estado de los agentes…</p>
                )}
                <div className="desk__status">
                  <span className={cn("ws-chip", conn.claude && !conn.claude.connected && "no")}>
                    Claude {conn.claude ? (conn.claude.connected ? "conectado" : "sin conectar") : "…"}
                  </span>
                  <span className="ws-chip">
                    Apify {conn.apify ? (conn.apify.connected ? "conectado" : "sin conectar") : "…"}
                  </span>
                </div>
              </div>
              {withoutDoc.length ? (
                <Link className="desk__cta" to={`/dashboard/${clientId}/agentes?edit=${withoutDoc[0].id}`}>
                  Empezar por {withoutDoc[0].name}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>

            <div className="desk">
              <div className="desk__head">
                Recientes
                <Link to={`/dashboard/${clientId}/plantel`}>Ver el plantel →</Link>
              </div>
              {recent === null ? (
                <p className="recent__empty">Buscando conversaciones…</p>
              ) : recent.length === 0 ? (
                <p className="recent__empty">Todavía no hay conversaciones. La primera arranca arriba.</p>
              ) : (
                <ul className="recent">
                  {recent.map((s) => (
                    <li key={s.session_id}>
                      <button
                        type="button"
                        onClick={() => openAgent(s.agent, `&session=${s.session_id}`)}
                      >
                        <span className="t">{s.title?.trim() || s.preview?.trim() || `Conversación #${s.session_id}`}</span>
                        <span className="d">{relDate(s.updated_at)}</span>
                        <span className="s">{s.agent.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
