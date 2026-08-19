import { useRef } from "react";
import { CornerRightUp, Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { DOCUMENT_ACCEPT } from "@/lib/read-document";

/**
 * AI Input — Kokonut UI (21st.dev/@kokonutd)
 * Auto-resize, Enter envía, Shift+Enter salto de línea, adjuntos.
 */
export function AIInput({
  id = "ai-input",
  placeholder = "Escribí un mensaje...",
  minHeight = 48,
  maxHeight = 160,
  value = "",
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  className,
}) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });
  const fileRef = useRef(null);

  const canSend = !disabled && !loading && (value.trim().length > 0 || attachments.length > 0);

  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit?.(value);
    adjustHeight(true);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="w-full rounded-3xl border border-white/10 bg-white/5 focus-within:ring-1 focus-within:ring-primary/60">
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((file) => (
              <span
                key={file.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/8 py-1 pl-2.5 pr-1 text-xs text-white/80"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="grid size-5 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label={`Quitar ${file.name}`}
                  onClick={() => onRemoveAttachment?.(file.id)}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="relative">
          <Textarea
            id={id}
            placeholder={placeholder}
            className={cn(
              "block box-border w-full rounded-3xl border-0 bg-transparent pl-5 pr-24",
              "placeholder:text-white/35 text-white resize-none py-4",
              "shadow-none focus-visible:ring-0",
              "min-h-[52px] max-h-[160px] [&::-webkit-resizer]:hidden"
            )}
            ref={textareaRef}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              onChange?.(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                onAttach?.(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={disabled || loading}
              aria-label="Adjuntar documento"
              className="grid size-8 place-items-center rounded-xl text-white/50 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-40"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              aria-label="Enviar"
              className={cn(
                "grid size-8 place-items-center rounded-xl bg-primary text-white transition-opacity",
                canSend ? "opacity-100" : "opacity-35"
              )}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CornerRightUp className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
