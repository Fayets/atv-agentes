import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  Check,
  Copy,
  Download,
  Loader2,
  PanelRightOpen,
  Plus,
  X,
} from "lucide-react";
import {
  chatAgent,
  deleteAgentSession,
  getAgentExamples,
  getAgentHistory,
  getClaudeStatus,
  getClientById,
  listAgentSessions,
  renameAgentSession,
  runAgent,
} from "@/lib/api";
import {
  categoryColor,
  categoryLabel,
  detectReferences,
  formatChars,
  modelForAgent,
  shortModel,
} from "@/lib/agents";
import { AgentAvatar } from "@/components/agent/AgentAvatar";
import { AgentChat } from "@/components/agent/agent-chat";
import { ActivityPanel } from "@/components/agent/ActivityPanel";
import { withMarkdown } from "@/components/agent/agent-output";
import { takePendingDraft } from "@/lib/draft-store";
import { cn } from "@/lib/utils";
import "@/components/agent/agent-workspace.css";

const PRE_STEP_MS = 420;

function mapHistoryMessages(rows = []) {
  return rows.map((m, i) => ({ id: `${m.role}-${i}`, role: m.role, content: m.content || "" }));
}

function formatSessionDate(iso) {
  if (!iso) return "Conversación";
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionLabel(item) {
  const title = item?.title?.trim();
  if (title) return title;
  const preview = item?.preview?.trim();
  if (preview) return preview;
  return `Conversación #${item?.session_id}`;
}

function lastAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "assistant" && typeof messages[i].content === "string") {
      return messages[i].content;
    }
  }
  return "";
}

/**
 * Workspace de un agente. Tres columnas, patrón Manus/Operator:
 * sesiones a la izquierda, conversación al centro, actividad en vivo a la
 * derecha. Sin modales: el brief, la corrida y la salida viven en la misma
 * pantalla.
 */
export default function AgentWorkspace({ agent, category, onClose, initialSessionId = null }) {
  const { clientId } = useParams();
  const agentName = agent?.name || "Agente";
  const clientName = getClientById(clientId)?.name || clientId || "Cliente";
  const color = categoryColor(category);

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatStatus, setChatStatus] = useState("ready");
  const [restoring, setRestoring] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [activityOpen, setActivityOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1100
  );
  const [copied, setCopied] = useState(false);

  // Hechos reales que muestra la actividad
  const [examples, setExamples] = useState(null);
  const [model, setModel] = useState("");

  const [trace, setTrace] = useState({ phase: "idle", steps: [], sources: null });
  const [runs, setRuns] = useState([]);
  const stepTimer = useRef(null);

  const running = trace.phase === "running";

  useEffect(() => {
    let alive = true;
    getAgentExamples(agent.id)
      .then((list) => alive && setExamples(Array.isArray(list) ? list.length : 0))
      .catch(() => alive && setExamples(0));
    getClaudeStatus()
      .then((s) => alive && setModel(modelForAgent(agent.id, s?.model)))
      .catch(() => alive && setModel(modelForAgent(agent.id, "")));
    return () => {
      alive = false;
    };
  }, [agent.id]);

  const refreshSessions = async () => {
    if (!agent?.id) return;
    try {
      const data = await listAgentSessions(clientId, agent.id);
      setSessions(data?.sessions || []);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, agent?.id]);

  useEffect(() => () => clearInterval(stepTimer.current), []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // el ⌘K vive arriba de esto y maneja su propio Escape
      if (document.querySelector(".cmdk-overlay")) return;
      e.stopPropagation();
      if (menu) return setMenu(null);
      if (renamingId) {
        setRenamingId(null);
        setRenameValue("");
        return;
      }
      onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, menu, renamingId]);

  // ----- trace -------------------------------------------------------------
  const startTrace = (kind, payload, files) => {
    clearInterval(stepTimer.current);
    const urls = detectReferences(payload);
    const fileNames = (files || []).map((f) => f.name).filter(Boolean);
    const chars = (payload || "").length;

    const steps =
      kind === "run"
        ? [
            {
              key: "brief",
              label: "Brief recibido",
              detail: [
                `${formatChars(chars)} chars`,
                fileNames.length ? `${fileNames.length} adjunto${fileNames.length === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            },
            { key: "tone", label: "Leyendo Estilo", detail: "tono de voz global" },
            { key: "prompt", label: `Leyendo prompt de ${agentName}` },
            ...(examples
              ? [{ key: "examples", label: "Ejemplos de referencia", detail: `${examples} cargado${examples === 1 ? "" : "s"}` }]
              : []),
            ...(urls.length
              ? [{ key: "refs", label: "Leyendo referencias", detail: urls.map((u) => u.platform).join(" · ") }]
              : []),
            { key: "gen", label: `Generando con ${shortModel(model)}`, detail: "puede tardar minutos" },
          ]
        : [
            { key: "msg", label: "Mensaje recibido", detail: `${formatChars(chars)} chars` },
            { key: "ctx", label: "Releyendo la conversación" },
            ...(urls.length
              ? [{ key: "refs", label: "Leyendo referencias", detail: urls.map((u) => u.platform).join(" · ") }]
              : []),
            { key: "gen", label: `Generando con ${shortModel(model)}` },
          ];

    const genIndex = steps.length - 1;
    let idx = 0;
    const withStatus = (i) => steps.map((s, j) => ({ ...s, status: j < i ? "done" : j === i ? "running" : "idle" }));

    setTrace({
      phase: "running",
      startedAt: Date.now(),
      finishedAt: null,
      steps: withStatus(0),
      sources: { urls, files: fileNames },
      model,
      examples,
      error: "",
    });

    stepTimer.current = setInterval(() => {
      idx += 1;
      if (idx >= genIndex) {
        clearInterval(stepTimer.current);
        idx = genIndex;
      }
      setTrace((t) => (t.phase === "running" ? { ...t, steps: withStatus(idx) } : t));
    }, PRE_STEP_MS);

    return { startedAt: Date.now() };
  };

  const finishTrace = ({ ok, error, chars }) => {
    clearInterval(stepTimer.current);
    setTrace((t) => {
      const finishedAt = Date.now();
      const steps = t.steps.map((s) => ({ ...s, status: ok ? "done" : s.status === "running" ? "error" : s.status }));
      if (ok) {
        steps.push({ key: "done", label: "Listo", detail: `${formatChars(chars)} chars`, status: "done" });
      }
      return { ...t, phase: ok ? "done" : "error", finishedAt, steps, error: error || "" };
    });
  };

  const recordRun = (kind, startedAt, ok, chars) => {
    setRuns((prev) => [
      { id: `${kind}-${startedAt}`, kind, elapsedMs: Date.now() - startedAt, ok, chars },
      ...prev,
    ].slice(0, 12));
  };

  // ----- sesiones ----------------------------------------------------------
  const applySession = (data) => {
    setSessionId(data.session_id);
    setActiveSessionId(data.session_id);
    setMessages(mapHistoryMessages(data.messages));
    setTrace({
      phase: "done",
      startedAt: null,
      finishedAt: null,
      steps: [
        { key: "restored", label: "Conversación restaurada", detail: `${data.messages.length} mensajes`, status: "done" },
      ],
      sources: null,
      model,
      examples,
      error: "",
    });
  };

  const startNewChat = () => {
    if (running) return;
    clearInterval(stepTimer.current);
    setSessionId(null);
    setActiveSessionId(null);
    setMessages([]);
    setChatStatus("ready");
    setTrace({ phase: "idle", steps: [], sources: null, model, examples });
    setRuns([]);
  };

  const openSession = async (sid) => {
    if (!sid || sid === activeSessionId || running) return;
    setRestoring(true);
    try {
      const data = await getAgentHistory(sid);
      if (data?.session_id && data?.messages?.length) applySession(data);
    } finally {
      setRestoring(false);
    }
  };

  const deleteSession = async (e, sid) => {
    e?.stopPropagation?.();
    setMenu(null);
    try {
      await deleteAgentSession(sid);
      setSessions((prev) => prev.filter((s) => s.session_id !== sid));
      if (activeSessionId === sid) startNewChat();
      if (renamingId === sid) {
        setRenamingId(null);
        setRenameValue("");
      }
    } catch {
      /* silencioso */
    }
  };

  const beginRename = (sid) => {
    const item = sessions.find((s) => s.session_id === sid);
    setMenu(null);
    setRenamingId(sid);
    setRenameValue(item?.title?.trim() || sessionLabel(item).slice(0, 80));
  };

  const commitRename = async () => {
    const sid = renamingId;
    const next = renameValue.trim();
    if (!sid) return;
    if (!next) {
      setRenamingId(null);
      setRenameValue("");
      return;
    }
    try {
      await renameAgentSession(sid, next);
      setSessions((prev) => prev.map((s) => (s.session_id === sid ? { ...s, title: next } : s)));
    } catch {
      /* silencioso */
    } finally {
      setRenamingId(null);
      setRenameValue("");
    }
  };

  const openContextMenu = (e, sid) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      sessionId: sid,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 100),
    });
  };

  // ----- correr / chatear --------------------------------------------------
  const handleSend = async (payload, meta = {}) => {
    const preview = meta.preview || payload;
    const files = meta.files || [];
    if ((!payload.trim() && !files.length) || running) return;

    const isFirst = !sessionId;
    setMessages((prev) => [...prev, { id: `u-${prev.length}`, role: "user", content: preview }]);
    setChatStatus("submitted");
    const { startedAt } = startTrace(isFirst ? "run" : "chat", payload, files);

    try {
      let text;
      if (isFirst) {
        const result = await runAgent(clientId || "test", agent.id, payload, files);
        setSessionId(result.session_id);
        setActiveSessionId(result.session_id);
        text = result.output;
      } else {
        const result = await chatAgent(sessionId, payload, files);
        text = result.reply;
      }
      setMessages((prev) => [...prev, { id: `a-${prev.length}`, role: "assistant", content: text }]);
      finishTrace({ ok: true, chars: (text || "").length });
      recordRun(isFirst ? "run" : "chat", startedAt, true, (text || "").length);
      refreshSessions();
    } catch (err) {
      const msg = err?.message || "La generación falló.";
      setMessages((prev) => [
        ...prev,
        { id: `a-err-${prev.length}`, role: "assistant", content: `Error: ${msg}` },
      ]);
      finishTrace({ ok: false, error: msg });
      recordRun(isFirst ? "run" : "chat", startedAt, false, 0);
    } finally {
      setChatStatus("ready");
    }
  };

  // Al abrir: o restaura una conversación pedida por URL, o manda lo que
  // se escribió en el cuadro del inicio.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (initialSessionId) {
      openSession(initialSessionId);
      return;
    }
    const draft = takePendingDraft();
    if (draft && (draft.text || draft.files?.length)) {
      handleSend(draft.text || "", { preview: draft.preview, files: draft.files || [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const output = useMemo(() => lastAssistantText(messages), [messages]);

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard bloqueado */
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  const downloadOutput = () => {
    if (!output) return;
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.id}-${stamp()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [exporting, setExporting] = useState(false);
  const downloadWord = async () => {
    if (!output || exporting) return;
    setExporting(true);
    try {
      // La librería de Word pesa ~400 kB: se carga recién cuando alguien la usa.
      const { downloadDocx } = await import("@/lib/export-docx");
      await downloadDocx(output, {
        title: `${agentName} · ${clientName}`,
        filename: `${agent.id}-${stamp()}.docx`,
      });
    } finally {
      setExporting(false);
    }
  };

  // PDF: la impresión del navegador con una hoja de estilo que deja solo la salida.
  const printPdf = () => {
    if (!output) return;
    window.print();
  };

  return (
    <div className="ws-page" style={{ "--agent": color }}>
      {/* ---------- rail izquierdo ---------- */}
      <aside className="ws-rail">
        <div className="ws-rail__identity">
          <AgentAvatar icon={agent.icon} category={category} size={44} glow />
          <div className="min-w-0">
            <p className="ws-kicker">{categoryLabel(category)}</p>
            <h1 className="ws-rail__name">{agentName}</h1>
          </div>
        </div>

        <div className="ws-rail__meta">
          <span className="ws-chip ws-mono">{agent.id}</span>
          <span className="ws-chip ws-mono">{shortModel(model) || "…"}</span>
          {examples != null ? (
            <span className="ws-chip ws-mono">{examples} ej.</span>
          ) : null}
        </div>

        <button type="button" className="ws-rail__new" onClick={startNewChat} disabled={running}>
          <Plus className="size-4" />
          Nueva corrida
        </button>

        <p className="ws-kicker ws-rail__label">Conversaciones</p>
        <div className="ws-rail__list">
          {sessions.length === 0 ? (
            <p className="ws-rail__empty">Todavía no hay conversaciones con este agente.</p>
          ) : (
            sessions.map((item) => (
              <div
                key={item.session_id}
                className={cn("ws-session", activeSessionId === item.session_id && "is-active")}
                role="button"
                tabIndex={0}
                onClick={() => renamingId !== item.session_id && openSession(item.session_id)}
                onContextMenu={(e) => openContextMenu(e, item.session_id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginRename(item.session_id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renamingId !== item.session_id) openSession(item.session_id);
                }}
                title="Click derecho o doble click para renombrar"
              >
                <div className="ws-session__top">
                  <span className="ws-session__date">{formatSessionDate(item.updated_at)}</span>
                  <button
                    type="button"
                    className="ws-session__del"
                    aria-label="Borrar conversación"
                    onClick={(e) => deleteSession(e, item.session_id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
                {renamingId === item.session_id ? (
                  <input
                    className="ws-session__rename"
                    value={renameValue}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                  />
                ) : (
                  <span className="ws-session__preview">{sessionLabel(item)}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="ws-rail__foot">
          <p className="ws-rail__client">{clientName}</p>
          <span className="ws-rail__esc"><kbd>esc</kbd> cerrar</span>
        </div>
      </aside>

      {menu ? (
        <div
          className="ws-ctx"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => beginRename(menu.sessionId)}>Renombrar</button>
          <button type="button" className="is-danger" onClick={(e) => deleteSession(e, menu.sessionId)}>
            Borrar
          </button>
        </div>
      ) : null}

      {/* ---------- centro ---------- */}
      <section className="ws-main">
        <header className="ws-topbar">
          <button type="button" className="ws-iconbtn" aria-label="Cerrar" onClick={onClose}>
            <X className="size-4" />
          </button>
          <div className="ws-topbar__title">
            <AgentAvatar icon={agent.icon} category={category} size={24} className="ws-topbar__avatar" />
            <span className="ws-topbar__name">{agentName}</span>
            <span className="ws-topbar__sep">/</span>
            <span className="ws-topbar__session">
              {activeSessionId ? sessionLabel(sessions.find((s) => s.session_id === activeSessionId)) : "Nueva corrida"}
            </span>
          </div>
          <div className="ws-topbar__actions">
            {running ? (
              <span className="ws-live">
                <Loader2 className="size-3.5 animate-spin" />
                Trabajando
              </span>
            ) : null}
            <button type="button" className="ws-iconbtn" aria-label="Copiar salida" disabled={!output} onClick={copyOutput} title="Copiar salida">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
            <button type="button" className="ws-iconbtn" aria-label="Descargar .md" disabled={!output} onClick={downloadOutput} title="Descargar Markdown">
              <Download className="size-4" />
            </button>
            <button type="button" className="ws-iconbtn ws-iconbtn--text" disabled={!output || exporting} onClick={downloadWord} title="Descargar como Word (.docx)">
              {exporting ? "…" : "Word"}
            </button>
            <button type="button" className="ws-iconbtn ws-iconbtn--text" disabled={!output} onClick={printPdf} title="Guardar como PDF (imprimir)">
              PDF
            </button>
            <button
              type="button"
              className={cn("ws-iconbtn", activityOpen && "is-on")}
              aria-label={activityOpen ? "Ocultar actividad" : "Mostrar actividad"}
              onClick={() => setActivityOpen((v) => !v)}
              title="Actividad"
            >
              {activityOpen ? <Activity className="size-4" /> : <PanelRightOpen className="size-4" />}
            </button>
          </div>
        </header>

        <div className="ws-conversation">
          {restoring ? (
            <div className="ws-restoring">
              <Loader2 className="size-5 animate-spin" />
              Cargando conversación…
            </div>
          ) : (
            <AgentChat
              layout="document"
              speaker={{ name: agentName, icon: agent.icon, category, color }}
              messages={withMarkdown(messages)}
              status={chatStatus}
              onSend={handleSend}
              placeholder={sessionId ? "Seguí trabajando sobre esta salida…" : "Pegá el brief o adjuntá un documento. Enter envía."}
              emptyTitle={`Qué le mandás a ${agentName}`}
              emptyDescription="El brief del cliente, una transcripción, un documento o un enlace de YouTube o Instagram. El agente lo lee junto con el Estilo, su prompt y sus ejemplos, y te devuelve la salida acá."
            />
          )}
        </div>
      </section>

      {/* ---------- actividad ---------- */}
      {activityOpen ? (
        <ActivityPanel
          trace={{ ...trace, model: trace.model || model, examples: trace.examples ?? examples }}
          runs={runs}
          onClose={() => setActivityOpen(false)}
        />
      ) : null}
    </div>
  );
}
