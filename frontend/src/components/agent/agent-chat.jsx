import { useEffect, useRef, useState } from "react";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIInput } from "@/components/kokonut/ai-input";
import { documentError, fileToApiAttachment, readDocumentFile } from "@/lib/read-document";

let attachSeq = 0;

/**
 * Agent Chat — inspirado en Agent Elements (21st.dev/@21st)
 * Shell: empty state centrado + burbujas + InputBar (Kokonut).
 */
export function AgentChat({
  messages = [],
  status = "ready",
  onSend,
  placeholder = "Escribí un mensaje...",
  emptyTitle = "Empezá la conversación",
  emptyDescription = "Pegá el brief y el agente responde acá.",
  suggestions = [],
  layout = "chat",
  className,
}) {
  const isDocument = layout === "document";
  const listRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState("");
  const [dragging, setDragging] = useState(false);
  const loading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && !loading;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const addFiles = (files) => {
    const next = [];
    let error = "";
    for (const file of files) {
      const msg = documentError(file);
      if (msg) {
        error = msg;
        continue;
      }
      next.push({
        id: `f-${Date.now()}-${attachSeq++}`,
        name: file.name,
        file,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 5));
    setAttachError(error);
  };

  const handleSend = async (value) => {
    const text = (value ?? draft).trim();
    if ((!text && !attachments.length) || loading) return;

    const files = attachments;
    setDraft("");
    setAttachments([]);
    setAttachError("");

    const apiFiles = [];
    const bodies = [];
    for (const item of files) {
      const pdf = await fileToApiAttachment(item.file);
      if (pdf) {
        apiFiles.push(pdf);
        continue;
      }
      const extracted = await readDocumentFile(item.file);
      bodies.push(`--- ${item.name} ---\n${extracted}`);
    }

    const preview = [text, ...files.map((item) => `📎 ${item.name}`)].filter(Boolean).join("\n");
    const payload = [text, ...bodies].filter(Boolean).join("\n\n");
    onSend?.(payload, { preview, files: apiFiles });
  };

  return (
    <div
      className={cn("relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files || []));
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border border-dashed border-primary/50 bg-black/55">
          <div className="flex flex-col items-center gap-2 text-white/80">
            <Paperclip className="size-5" />
            <p className="text-sm">Soltá el documento</p>
          </div>
        </div>
      ) : null}

      <div
        ref={listRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          isDocument ? "px-0 py-0" : "px-4 py-5"
        )}
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <div className="mb-4 grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-primary">
              <Sparkles className="size-4" />
            </div>
            <p className="text-base font-medium text-white">{emptyTitle}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {emptyDescription}
            </p>
            {suggestions.length > 0 ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-primary/50 hover:text-white"
                    onClick={() => handleSend(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : isDocument ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10 md:px-10">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[min(85%,520px)] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white/8 px-4 py-2.5 text-sm leading-relaxed text-white/90">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="w-full text-[0.9rem] leading-relaxed text-white/88">
                  {m.content}
                </div>
              )
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-white/45">
                <span className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-white/40" />
                <span className="ml-1">Escribiendo…</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex w-full flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-[92%] gap-2",
                  m.role === "user" ? "self-end" : "self-start"
                )}
              >
                {m.role === "assistant" ? (
                  <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">
                    A
                  </div>
                ) : null}
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-2xl rounded-br-sm bg-white/10 text-white"
                      : "rounded-2xl rounded-bl-sm border border-white/8 bg-[#161618] text-white/85"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex self-start gap-2">
                <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">
                  A
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-white/8 bg-[#161618] px-3.5 py-3">
                  <span className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:-0.2s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:-0.1s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/40" />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        className={cn(
          "w-full shrink-0",
          isDocument
            ? "border-t border-white/8 bg-[#09090b]/95 px-4 py-4 backdrop-blur-md"
            : "px-4 pb-4"
        )}
      >
        <div className={cn(isDocument && "mx-auto w-full max-w-3xl")}>
        {attachError ? <p className="mb-2 px-1 text-xs text-red-400">{attachError}</p> : null}
          <AIInput
            value={draft}
            onChange={setDraft}
            onSubmit={handleSend}
            placeholder={placeholder}
            disabled={loading}
            loading={loading}
            attachments={attachments}
            onAttach={addFiles}
            onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((item) => item.id !== id))}
          />
        </div>
      </div>
    </div>
  );
}
