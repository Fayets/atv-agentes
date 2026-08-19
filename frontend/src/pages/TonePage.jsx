import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getToneDoc, saveToneDoc } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function TonePage() {
  const [toneDoc, setToneDoc] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getToneDoc()
      .then((data) => setToneDoc(data.tone_doc || ""))
      .catch(() => setError("No se pudo cargar el documento. ¿Está corriendo el backend?"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await saveToneDoc(toneDoc);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("No se pudo guardar. Revisá que uvicorn esté en el puerto 8000.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/8 px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Documento general</p>
          <h1 className="mt-1 text-lg font-semibold text-white">Tono de voz</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Estilo compartido por todos los agentes. Define cómo habla y escribe Juan Cruz.
          </p>
        </div>

        {loading ? (
          <div className="page-center">
            <p className="text-sm text-white/35">Cargando documento…</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
              <textarea
                value={toneDoc}
                onChange={(e) => setToneDoc(e.target.value)}
                className="min-h-[28rem] w-full resize-y rounded-xl border border-white/10 bg-[#111] p-4 font-mono text-sm leading-relaxed text-white/85 outline-none focus:border-primary/50"
                placeholder="Pegá acá el documento de tono de voz…"
              />
              <div className="pb-8">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando…" : saved ? "Guardado" : "Guardar documento"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
