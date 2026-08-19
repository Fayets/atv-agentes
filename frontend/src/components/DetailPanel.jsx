import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as api from "@/lib/api";
import StatusPill from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShineBorder } from "@/components/magicui/shine-border";

export default function DetailPanel({ entryId, onClose, onDeleted }) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getKbEntry(entryId)
      .then((data) => {
        if (alive) setEntry(data);
      })
      .catch(() => {
        if (alive) setError("No se pudo cargar el documento.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [entryId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDelete() {
    if (!entry || deleting) return;
    setDeleting(true);
    try {
      await api.deleteKbEntry(entry.id);
      onDeleted?.(entry.id);
      onClose?.();
    } catch {
      setError("No se pudo eliminar.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55" onClick={onClose}>
      <aside
        className="relative flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#0c0c0e] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <ShineBorder shineColor={["#e11d2e", "#ffffff18"]} duration={18} />
        <header className="mb-4 flex justify-end">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </header>

        {loading ? (
          <div className="grid flex-1 place-items-center">
            <div className="spinner" />
          </div>
        ) : error && !entry ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : entry ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {api.CATEGORY_LABELS[entry.category] || entry.category}
              </Badge>
              <StatusPill status={entry.status} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{entry.title}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{entry.filename}</p>
            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-white/8 bg-black/40 p-4">
              {entry.content ? (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                  {entry.content}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {entry.status === "processing"
                    ? "Aún procesando — el contenido llega en breve."
                    : "Sin contenido disponible."}
                </p>
              )}
            </div>
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
            <footer className="mt-4">
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </footer>
          </>
        ) : null}
      </aside>
    </div>
  );
}
