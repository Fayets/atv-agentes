import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CATEGORY_LABELS, chatAgent, deleteAgentSession, getAgentHistory, getClientById, listAgentSessions, renameAgentSession, runAgent } from "@/lib/api";
import {
  downloadPresentationHtml,
  extractPresentationHtml,
  latestPresentationHtml,
  openPresentationPreview,
  postSlideNav,
  stripPresentationHtml,
} from "@/lib/presentation-html";
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

function PresentationFrame({ html }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        postSlideNav(iframeRef.current, "next");
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        postSlideNav(iframeRef.current, "prev");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);

  return (
    <div
      style={{
        marginTop: "0.75rem",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "#000",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.55rem 0.75rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(255,255,255,0.55)" }}>
          Preview · ← → o click izq/der
        </p>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            onClick={() => postSlideNav(iframeRef.current, "prev")}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "6px",
              padding: "0.35rem 0.55rem",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => postSlideNav(iframeRef.current, "next")}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "6px",
              padding: "0.35rem 0.55rem",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            →
          </button>
          <button
            type="button"
            onClick={() => openPresentationPreview(html)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "6px",
              padding: "0.35rem 0.6rem",
              cursor: "pointer",
              fontSize: "0.72rem",
            }}
          >
            <ExternalLink className="size-3.5" />
            Pantalla completa
          </button>
          <button
            type="button"
            onClick={() => downloadPresentationHtml(html, "presentacion.html")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "#c0392b",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "0.35rem 0.6rem",
              cursor: "pointer",
              fontSize: "0.72rem",
              fontWeight: 600,
            }}
          >
            <Download className="size-3.5" />
            Descargar
          </button>
        </div>
      </div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "62vh", background: "#0a0a0a" }}>
        <iframe
          ref={iframeRef}
          title="Preview de presentación"
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin"
          tabIndex={0}
          onLoad={(e) => {
            try {
              const win = e.currentTarget.contentWindow;
              win?.focus();
              // Asegura API de navegación disponible para los botones del chrome
              if (!win?.ATVDeck) {
                win?.postMessage({ type: "atv-slide-nav", dir: "noop" }, "*");
              }
            } catch {
              /* ignore */
            }
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            background: "#0a0a0a",
          }}
        />
      </div>
    </div>
  );
}

function AgentMessageContent({ content }) {
  const html = extractPresentationHtml(content);
  const summary = html ? stripPresentationHtml(content) : content;

  return (
    <div style={{ fontSize: "0.95rem", color: "#ccc", lineHeight: 1.75 }}>
      {summary ? <ReactMarkdown components={MARKDOWN_COMPONENTS}>{summary}</ReactMarkdown> : null}
      {html ? <PresentationFrame html={html} /> : null}
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

function sessionLabel(item) {
  const title = item?.title?.trim();
  if (title) return title;
  const preview = item?.preview?.trim();
  if (preview) return preview;
  return `Conversación #${item?.session_id}`;
}

export default function AgentDocView({ agent, category, onClose }) {
  const { clientId } = useParams();
  const agentName = agent?.name || "Agente";
  const categoryLabel = CATEGORY_LABELS[category] || category || "Agente";
  const clientName = getClientById(clientId)?.name || clientId || "Cliente";
  const [sessionId, setSessionId] = useState(null);
  const [nodes, setNodes] = useState(() => seed(agentName));
  const [openId, setOpenId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatStatus, setChatStatus] = useState("ready");
  const [processStep, setProcessStep] = useState("idle");
  const [restoring, setRestoring] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const running = nodes.some((n) => n.status === "running");
  const openNode = nodes.find((n) => n.id === openId);
  const meta = openNode ? NODE_META[openNode.type] || NODE_META.work : null;
  const Icon = meta?.icon;
  const isOutputOpen = openNode?.type === "chat";
  const presentationHtml =
    agent?.id === "vt5" ? latestPresentationHtml(messages) : "";

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
      // silencioso
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
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sid ? { ...s, title: next } : s))
      );
    } catch {
      // silencioso
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
      e.stopPropagation();
      if (menu) {
        setMenu(null);
        return;
      }
      if (renamingId) {
        setRenamingId(null);
        setRenameValue("");
        return;
      }
      if (openId) setOpenId(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, openId, menu, renamingId]);

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
      <aside className="wf-sidebar">
        <div className="wf-sidebar__brand">
          <span className="wf-page__pill">{categoryLabel}</span>
          <h1 className="wf-sidebar__title">{agentName}</h1>
        </div>

        <button type="button" className="wf-sidebar__new" onClick={startNewChat}>
          + Nuevo chat
        </button>

        <p className="wf-sidebar__label">Chats</p>
        <div className="wf-sidebar__list">
          {sessions.length === 0 ? (
            <p className="wf-sidebar__empty">Todavía no hay conversaciones.</p>
          ) : (
            sessions.map((item) => (
              <div
                key={item.session_id}
                className={`wf-session${activeSessionId === item.session_id ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (renamingId === item.session_id) return;
                  openSession(item.session_id);
                }}
                onContextMenu={(e) => openContextMenu(e, item.session_id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginRename(item.session_id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renamingId !== item.session_id) {
                    openSession(item.session_id);
                  }
                }}
                title="Click derecho o doble click para renombrar"
              >
                <div className="wf-session__top">
                  <span className="wf-session__date">{formatSessionDate(item.updated_at)}</span>
                  <button
                    type="button"
                    className="wf-session__del"
                    aria-label="Borrar conversación"
                    onClick={(e) => deleteSession(e, item.session_id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
                {renamingId === item.session_id ? (
                  <input
                    className="wf-session__rename"
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
                  <span className="wf-session__preview">{sessionLabel(item)}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="wf-sidebar__foot">
          <button type="button" className="wf-page__close" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      </aside>

      {menu ? (
        <div
          className="wf-ctx"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => beginRename(menu.sessionId)}>
            Renombrar
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={(e) => deleteSession(e, menu.sessionId)}
          >
            Borrar
          </button>
        </div>
      ) : null}

      <div className="wf-main">
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
                    <p>{clientName}</p>
                    <h2>{agentName}</h2>
                  </div>
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
                      afterMessages={
                        agent?.id === "vt5" &&
                        chatStatus === "ready" &&
                        presentationHtml ? (
                          <p
                            style={{
                              margin: "0.75rem 0 0",
                              paddingTop: "0.75rem",
                              borderTop: "1px solid rgba(255,255,255,0.08)",
                              fontSize: "0.8rem",
                              color: "rgba(255,255,255,0.45)",
                            }}
                          >
                            Pedí cambios en el chat (ej: “slide 3 más corto”) y se regenera el preview.
                          </p>
                        ) : null
                      }
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
    </div>
  );
}
