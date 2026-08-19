import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CATEGORY_LABELS, chatAgent, getAgentHistory, listAgentSessions, runAgent } from "@/lib/api";
import { AgentWorkflow, NODE_META } from "@/components/agent/agent-workflow";
import "@/components/agent/agent-workflow.css";
import { AgentChat } from "@/components/agent/agent-chat";
import { ShineBorder } from "@/components/magicui/shine-border";
import { Button } from "@/components/ui/button";

function seed(agentName) {
  return [
    { id: "n-input", type: "input", title: "Documento", content: "", status: "idle" },
    { id: "n-work", type: "work", title: agentName, content: "", status: "idle" },
    { id: "n-chat", type: "chat", title: "Chat", content: "", status: "idle" },
  ];
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p style={{ margin: "0 0 0.75rem" }}>{children}</p>,
  h1: ({ children }) => (
    <h1 style={{ fontSize: "1rem", color: "#fff", margin: "1rem 0 0.5rem" }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: "0.95rem", color: "#fff", margin: "1rem 0 0.5rem" }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: "0.9rem", color: "#ddd", margin: "0.75rem 0 0.4rem" }}>{children}</h3>
  ),
  ul: ({ children }) => <ul style={{ paddingLeft: "1.25rem", margin: "0 0 0.75rem" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: "1.25rem", margin: "0 0 0.75rem" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: "0.25rem" }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: "#fff", fontWeight: 600 }}>{children}</strong>,
  hr: () => <hr style={{ border: "none", borderTop: "1px solid #222", margin: "1rem 0" }} />,
  code: ({ children }) => (
    <code
      style={{
        background: "#1a1a1a",
        padding: "0.1rem 0.3rem",
        borderRadius: "3px",
        fontSize: "0.8rem",
      }}
    >
      {children}
    </code>
  ),
};

function AgentMessageContent({ content }) {
  return (
    <div style={{ fontSize: "0.95rem", color: "#ccc", lineHeight: 1.75 }}>
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
    </div>
  );
}

function withMarkdown(messages) {
  return messages.map((m) =>
    m.role === "assistant"
      ? { ...m, content: <AgentMessageContent content={m.content} /> }
      : m
  );
}

function mapHistoryMessages(rows = []) {
  return rows.map((m, i) => ({
    id: `${m.role}-${i}`,
    role: m.role,
    content: m.content || "",
  }));
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

export default function AgentDocView({ agent, category, onClose }) {
  const { clientId } = useParams();
  const agentName = agent?.name || "Agente";
  const categoryLabel = CATEGORY_LABELS[category] || category || "Agente";
  const [sessionId, setSessionId] = useState(null);
  const [nodes, setNodes] = useState(() => seed(agentName));
  const [openId, setOpenId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatStatus, setChatStatus] = useState("ready");
  const [processStep, setProcessStep] = useState("idle");
  const [restoring, setRestoring] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const running = nodes.some((n) => n.status === "running");
  const openNode = nodes.find((n) => n.id === openId);
  const meta = openNode ? NODE_META[openNode.type] || NODE_META.work : null;
  const Icon = meta?.icon;
  const isOutputOpen = openNode?.type === "chat";

  const patch = (id, data) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...data } : n)));
  };

  const refreshSessions = async () => {
    if (!agent?.id) return;
    try {
      const data = await listAgentSessions(clientId, agent.id);
      setSessions(data?.sessions || []);
    } catch {
      setSessions([]);
    }
  };

  const applySession = (data) => {
    const restored = mapHistoryMessages(data.messages);
    const firstUser = restored.find((m) => m.role === "user");

    setSessionId(data.session_id);
    setActiveSessionId(data.session_id);
    setMessages(restored);
    patch("n-input", {
      content: firstUser?.content || "",
      status: "done",
    });
    patch("n-work", { status: "done", content: "Procesó el documento." });
    patch("n-chat", { status: "done" });
    setProcessStep("done");
    setOpenId("n-chat");
  };

  const startNewChat = () => {
    setSessionId(null);
    setActiveSessionId(null);
    setMessages([]);
    setNodes(seed(agentName));
    setOpenId(null);
    setProcessStep("idle");
    setChatStatus("ready");
  };

  const openSession = async (sid) => {
    if (!sid || sid === activeSessionId) {
      setOpenId("n-chat");
      return;
    }

    setRestoring(true);
    setOpenId("n-chat");
    try {
      const data = await getAgentHistory(sid);
      if (data?.session_id && data?.messages?.length) {
        applySession(data);
      }
    } catch {
      setOpenId(null);
    } finally {
      setRestoring(false);
    }
  };

  useEffect(() => {
    refreshSessions();
  }, [clientId, agent?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (openId) setOpenId(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, openId]);

  const runFirst = async (payload, meta = {}) => {
    const preview = meta.preview || payload;
    const files = meta.files || [];
    if (!payload.trim() && !files.length) return;
    patch("n-input", { content: preview, status: "done" });
    patch("n-work", { status: "running" });
    patch("n-chat", { status: "idle" });
    setProcessStep("tone");
    setOpenId(null);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      const pending = runAgent(clientId || "test", agent.id, payload, files);
      await wait(1100);
      setProcessStep("prompt");
      const result = await pending;
      setSessionId(result.session_id);
      setActiveSessionId(result.session_id);
      setProcessStep("done");
      patch("n-work", { status: "done", content: "Procesó el documento." });
      patch("n-chat", { status: "done" });
      setMessages([
        { id: "u-0", role: "user", content: preview },
        { id: "a-0", role: "assistant", content: result.output },
      ]);
      setOpenId("n-chat");
      refreshSessions();
    } catch {
      setProcessStep("error");
      patch("n-work", { status: "error", content: "Error al ejecutar el agente." });
    }
  };

  const handleChatSend = async (payload, meta = {}) => {
    const preview = meta.preview || payload;
    const files = meta.files || [];
    if (!sessionId || (!payload.trim() && !files.length)) return;
    setMessages((prev) => [...prev, { id: `u-${prev.length}`, role: "user", content: preview }]);
    setChatStatus("submitted");
    patch("n-work", { status: "running" });
    setProcessStep("tone");
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      const pending = chatAgent(sessionId, payload, files);
      await wait(800);
      setProcessStep("prompt");
      const result = await pending;
      setProcessStep("done");
      setMessages((prev) => [
        ...prev,
        { id: `a-${prev.length}`, role: "assistant", content: result.reply },
      ]);
      patch("n-work", { status: "done" });
      refreshSessions();
    } catch {
      setProcessStep("error");
      setMessages((prev) => [
        ...prev,
        { id: `a-err-${prev.length}`, role: "assistant", content: "Error en el chat." },
      ]);
      patch("n-work", { status: "error" });
    } finally {
      setChatStatus("ready");
    }
  };

  return (
    <div className="wf-page">
      <header className={`wf-page__head${isOutputOpen ? " is-hidden" : ""}`}>
        <div className="wf-page__head-row">
          <div className="wf-page__brand">
            <span className="wf-page__pill">{categoryLabel}</span>
            <h1 className="wf-page__title">{agentName}</h1>
          </div>
          <div className="wf-page__actions">
            <button type="button" className="wf-new-chat" onClick={startNewChat}>
              Nuevo chat
            </button>
            <button type="button" className="wf-page__close" onClick={onClose} aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </div>
        </div>
        {sessions.length > 0 ? (
          <div className="wf-sessions">
            {sessions.map((item) => (
              <button
                key={item.session_id}
                type="button"
                className={`wf-session${activeSessionId === item.session_id ? " is-active" : ""}`}
                onClick={() => openSession(item.session_id)}
              >
                <span className="wf-session__date">{formatSessionDate(item.updated_at)}</span>
                <span className="wf-session__preview">
                  {item.preview?.trim() || `Conversación #${item.session_id}`}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="wf-shell">
        <AgentWorkflow
          nodes={nodes}
          selectedId={openId}
          onSelect={setOpenId}
          agentName={agentName}
          obscured={Boolean(openNode)}
          processStep={processStep}
        />

        {isOutputOpen ? (
          <div className="wf-output">
            <div className="wf-output__panel">
              <header className="wf-output__head">
                <button
                  type="button"
                  className="wf-output__back"
                  aria-label="Volver al flujo"
                  onClick={() => setOpenId(null)}
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div className="wf-output__meta">
                  <p>Salida</p>
                  <h2>{agentName}</h2>
                </div>
                <button type="button" className="wf-new-chat" onClick={startNewChat}>
                  Nuevo chat
                </button>
                <button type="button" className="wf-page__close" onClick={onClose} aria-label="Cerrar">
                  <X className="size-4" />
                </button>
              </header>
              <div className="wf-output__body">
                {restoring ? (
                  <div className="grid flex-1 place-items-center text-sm text-white/45">
                    <Loader2 className="mb-2 size-5 animate-spin" />
                    Cargando conversación…
                  </div>
                ) : (
                  <AgentChat
                    layout="document"
                    messages={withMarkdown(messages)}
                    status={chatStatus}
                    onSend={handleChatSend}
                    placeholder="Seguí trabajando sobre esta salida…"
                    emptyTitle="Todavía no hay salida"
                    emptyDescription="Cargá el documento en el primer nodo. Cuando el agente termine, la salida aparece acá."
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {openNode && !isOutputOpen ? (
          <div className="wf-window" onClick={() => setOpenId(null)}>
            <div
              className="wf-window__card"
              onClick={(e) => e.stopPropagation()}
            >
              <ShineBorder shineColor={["#e11d2e", "#ffffff22"]} duration={14} />
              <header className="wf-window__head">
                <span
                  className="grid size-10 place-items-center rounded-xl text-white"
                  style={{ background: meta.color }}
                >
                  {openNode.status === "running" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="wf-window__kicker">{meta.kicker}</p>
                  <h2>{openNode.title}</h2>
                </div>
                <Button variant="ghost" size="icon" aria-label="Cerrar ventana" onClick={() => setOpenId(null)}>
                  <X className="size-4" />
                </Button>
              </header>

              {openNode.type === "input" ? (
                <div className="wf-window__body">
                  <AgentChat
                    messages={
                      openNode.content
                        ? [{ id: "input-sent", role: "user", content: openNode.content }]
                        : []
                    }
                    status={running ? "submitted" : "ready"}
                    onSend={runFirst}
                    placeholder="Escribí o adjuntá un documento…"
                    emptyTitle="Documento o brief"
                    emptyDescription="Escribí como en un chat o adjuntá un .md, .txt o .pdf. Enter envía."
                  />
                </div>
              ) : null}

              {openNode.type === "work" ? (
                <div className="wf-window__body">
                  <div className={`wf-work${openNode.status === "done" ? " is-done" : ""}`}>
                    <div className="wf-orb" aria-hidden="true">
                      <span className="wf-orb__ring" />
                      <span className="wf-orb__ring" />
                      <span className="wf-orb__ring" />
                      <span className="wf-orb__core" />
                    </div>
                    <p>
                      {openNode.status === "running"
                        ? "El agente está leyendo el documento, el prompt de proceso y el tono de voz…"
                        : openNode.status === "done"
                          ? "Listo. Abrí Chat para ver la salida y seguir."
                          : openNode.status === "error"
                            ? "Falló el proceso. Volvé a Documento e intentá de nuevo."
                            : "Cuando mandes el documento, acá corre el prompt del agente + el tono de voz."}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
