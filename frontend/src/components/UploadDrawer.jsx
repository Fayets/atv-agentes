import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShineBorder } from "@/components/magicui/shine-border";
import { cn } from "@/lib/utils";
import { DOCUMENT_ACCEPT, documentError } from "@/lib/read-document";

export default function UploadDrawer({
  open,
  onClose,
  initialCategory = "marketing",
  onUpload,
}) {
  const [category, setCategory] = useState(initialCategory);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCategory(initialCategory || "marketing");
      setFile(null);
      setError("");
      setUploading(false);
    }
  }, [open, initialCategory]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Una sola fuente de verdad para qué se acepta: lib/read-document.
  function validate(f) {
    return documentError(f);
  }

  function takeFile(f) {
    const msg = validate(f);
    setError(msg);
    setFile(msg ? null : f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const msg = validate(file);
    if (msg) {
      setError(msg);
      return;
    }
    setUploading(true);
    try {
      await onUpload?.({ file, category });
      onClose?.();
    } catch {
      setError("Falló la subida. Reintentá.");
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55" onClick={onClose}>
      <aside
        className="relative h-full w-full max-w-md border-l border-white/10 bg-[#0c0c0e] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <ShineBorder shineColor={["#e11d2e", "#ffffff18"]} duration={18} />
        <header className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cargar documento</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </header>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="category">Categoría</Label>
            <select
              id="category"
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-black">
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={cn(
              "rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-10 text-center transition-colors",
              dragging && "border-primary/60 bg-primary/10"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <p className="text-sm">Soltá el archivo o hacé click</p>
            <p className="mt-1 text-xs text-muted-foreground">.md · .txt · .docx · .pdf · imágenes · máx 10MB</p>
            {file ? <p className="mt-3 text-sm text-primary">{file.name}</p> : null}
            <input
              ref={inputRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              hidden
              onChange={(e) => takeFile(e.target.files?.[0])}
            />
          </button>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <Button type="submit" disabled={uploading || !file}>
            {uploading ? "Subiendo…" : "Subir"}
          </Button>
        </form>
      </aside>
    </div>
  );
}
