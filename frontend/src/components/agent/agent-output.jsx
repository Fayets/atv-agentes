import { useEffect, useRef } from "react";
import { Download, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
// Tablas, tachado y listas de tareas son GFM, no Markdown base: sin este
// plugin las filas de una tabla se pegan en un solo párrafo.
import remarkGfm from "remark-gfm";
import {
  downloadPresentationHtml,
  extractPresentationHtml,
  openPresentationPreview,
  postSlideNav,
  stripPresentationHtml,
} from "@/lib/presentation-html";

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="ws-md__p">{children}</p>,
  h1: ({ children }) => <h1 className="ws-md__h1">{children}</h1>,
  h2: ({ children }) => <h2 className="ws-md__h2">{children}</h2>,
  h3: ({ children }) => <h3 className="ws-md__h3">{children}</h3>,
  ul: ({ children }) => <ul className="ws-md__ul">{children}</ul>,
  ol: ({ children }) => <ol className="ws-md__ol">{children}</ol>,
  li: ({ children }) => <li className="ws-md__li">{children}</li>,
  strong: ({ children }) => <strong className="ws-md__strong">{children}</strong>,
  hr: () => <hr className="ws-md__hr" />,
  blockquote: ({ children }) => <blockquote className="ws-md__quote">{children}</blockquote>,
  code: ({ children }) => <code className="ws-md__code">{children}</code>,
  table: ({ children }) => (
    <div className="ws-md__tablewrap">
      <table className="ws-md__table">{children}</table>
    </div>
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
    <div className="ws-deck">
      <div className="ws-deck__bar">
        <p>Preview · ← → o click izq/der</p>
        <div className="ws-deck__actions">
          <button type="button" onClick={() => postSlideNav(iframeRef.current, "prev")}>←</button>
          <button type="button" onClick={() => postSlideNav(iframeRef.current, "next")}>→</button>
          <button type="button" onClick={() => openPresentationPreview(html)}>
            <ExternalLink className="size-3.5" />
            Pantalla completa
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => downloadPresentationHtml(html, "presentacion.html")}
          >
            <Download className="size-3.5" />
            Descargar
          </button>
        </div>
      </div>
      <div className="ws-deck__frame">
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
              if (!win?.ATVDeck) win?.postMessage({ type: "atv-slide-nav", dir: "noop" }, "*");
            } catch {
              /* ignore */
            }
          }}
        />
      </div>
    </div>
  );
}

export function AgentMessageContent({ content }) {
  const html = extractPresentationHtml(content);
  const summary = html ? stripPresentationHtml(content) : content;
  return (
    <div className="ws-md">
      {summary ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {summary}
        </ReactMarkdown>
      ) : null}
      {html ? <PresentationFrame html={html} /> : null}
    </div>
  );
}

export function withMarkdown(messages) {
  return messages.map((m) =>
    m.role === "assistant" ? { ...m, content: <AgentMessageContent content={m.content} /> } : m
  );
}
