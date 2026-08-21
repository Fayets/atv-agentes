import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  createAgentExample,
  deleteAgentExample,
  extractExampleDocument,
  getAgentConfig,
  getAgentExamples,
  listAgents,
  saveAgentConfig,
} from "@/lib/api";
import { DOCUMENT_ACCEPT, documentError } from "@/lib/read-document";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [examples, setExamples] = useState([]);
  const [newExampleTitle, setNewExampleTitle] = useState("");
  const [newExampleContent, setNewExampleContent] = useState("");
  const [addingExample, setAddingExample] = useState(false);
  const [showAddExample, setShowAddExample] = useState(false);
  const [extractingExample, setExtractingExample] = useState(false);
  const [exampleFileName, setExampleFileName] = useState("");
  const [exampleFileMeta, setExampleFileMeta] = useState(null);
  const exampleFileRef = useRef(null);

  const selected = agents.find((a) => a.id === selectedId) || null;
  const dirty = prompt !== savedPrompt;

  const grouped = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      agents: agents.filter((a) => a.category === category),
    })).filter((g) => g.agents.length);
  }, [agents]);

  const loadList = () => {
    setListLoading(true);
    setError("");
    listAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setError("No se pudo cargar los agentes. ¿Está corriendo el backend?"))
      .finally(() => setListLoading(false));
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDocLoading(true);
    setError("");
    setShowAddExample(false);
    setNewExampleTitle("");
    setNewExampleContent("");
    setExampleFileName("");
    setExampleFileMeta(null);
    getAgentConfig(selectedId)
      .then((data) => {
        const next = data.system_prompt || "";
        setPrompt(next);
        setSavedPrompt(next);
      })
      .catch(() => setError("No se pudo cargar el documento de este agente."))
      .finally(() => setDocLoading(false));

    getAgentExamples(selectedId)
      .then(setExamples)
      .catch(() => setExamples([]));
  }, [selectedId]);

  const handleSelect = (id) => {
    if (id === selectedId) return;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    setSaved(false);
    setSelectedId(id);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await saveAgentConfig(selectedId, "", prompt);
      setSavedPrompt(prompt);
      setSaved(true);
      setAgents((prev) =>
        prev.map((a) => (a.id === selectedId ? { ...a, has_prompt: Boolean(prompt.trim()) } : a))
      );
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("No se pudo guardar. Revisá que uvicorn esté en el puerto 8000.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddExample = async () => {
    if (!selectedId || !newExampleTitle.trim() || !newExampleContent.trim()) return;
    setAddingExample(true);
    try {
      const created = await createAgentExample(
        selectedId,
        newExampleTitle,
        newExampleContent,
        exampleFileMeta || {}
      );
      setExamples((prev) => [...prev, created]);
      setNewExampleTitle("");
      setNewExampleContent("");
      setExampleFileName("");
      setExampleFileMeta(null);
      setShowAddExample(false);
    } catch (e) {
      setError(e?.message || "No se pudo guardar el ejemplo.");
    } finally {
      setAddingExample(false);
    }
  };

  const handleExampleFile = async (file) => {
    const msg = documentError(file);
    if (msg) {
      setError(msg);
      return;
    }
    setExtractingExample(true);
    setError("");
    try {
      const data = await extractExampleDocument(file);
      setExampleFileName(file.name);
      setNewExampleTitle((prev) => prev.trim() || data.title || "");
      setNewExampleContent(data.content || "");
      if (data.file_data) {
        setExampleFileMeta({
          media_type: data.media_type,
          file_data: data.file_data,
          filename: data.filename || file.name,
        });
      } else {
        setExampleFileMeta(null);
      }
    } catch (e) {
      setError(e?.message || "No se pudo leer el documento. Probá .md, .txt, .docx o .pdf.");
    } finally {
      setExtractingExample(false);
      if (exampleFileRef.current) exampleFileRef.current.value = "";
    }
  };

  const handleDeleteExample = async (id) => {
    try {
      await deleteAgentExample(id);
      setExamples((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("No se pudo eliminar el ejemplo.");
    }
  };

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/8 px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Por agente</p>
          <h1 className="mt-1 text-lg font-semibold text-white">Documentos de procesamiento</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            La lógica de cada agente. El tono de voz es global: está en Estilo.
          </p>
        </div>

        {listLoading ? (
          <div className="page-center">
            <p className="text-sm text-white/35">Cargando agentes…</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-white/8 px-3 py-4">
              {grouped.map((group) => (
                <div key={group.category} className="mb-5">
                  <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.agents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleSelect(agent.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          selectedId === agent.id
                            ? "bg-primary/15 text-white"
                            : "text-white/65 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <span className="min-w-0 truncate">{agent.name}</span>
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            agent.has_prompt ? "bg-primary" : "bg-white/20"
                          )}
                          title={agent.has_prompt ? "Tiene documento" : "Sin documento"}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </aside>

            <div className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-5">
              {!selected ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-white/35">Elegí un agente para pegar su documento.</p>
                </div>
              ) : docLoading ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-white/35">Cargando documento…</p>
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                      {CATEGORY_LABELS[selected.category] || selected.category}
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">{selected.name}</h2>
                  </div>
                  {error ? <p className="text-sm text-red-400">{error}</p> : null}
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[28rem] w-full resize-y rounded-xl border border-white/10 bg-[#111] p-4 font-mono text-sm leading-relaxed text-white/85 outline-none focus:border-primary/50"
                    placeholder="Pegá acá el documento de procesamiento de este agente…"
                  />

                  <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                          Ejemplos de output ({examples.length})
                        </p>
                        <p className="mt-1 text-sm text-white/45">
                          Outputs reales o documentos (.md, .txt, .docx, .pdf). El agente los usa como referencia.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddExample((v) => !v)}
                      >
                        {showAddExample ? "Cancelar" : "+ Agregar ejemplo"}
                      </Button>
                    </div>

                    {examples.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {examples.map((ex) => (
                          <div
                            key={ex.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-[#111] px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white">{ex.title}</p>
                              <p className="mt-0.5 truncate text-xs text-white/40">
                                {ex.has_file
                                  ? `📎 ${ex.filename || "documento.pdf"}`
                                  : `${(ex.content || "").slice(0, 140)}…`}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-white/40 hover:text-red-400"
                              onClick={() => handleDeleteExample(ex.id)}
                              aria-label="Eliminar ejemplo"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showAddExample ? (
                      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-[#111] p-3">
                        <button
                          type="button"
                          disabled={extractingExample}
                          onClick={() => exampleFileRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) handleExampleFile(file);
                          }}
                          className="rounded-lg border border-dashed border-white/15 bg-[#0a0a0a] px-3 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                        >
                          <p className="text-sm text-white/70">
                            {extractingExample
                              ? "Leyendo documento…"
                              : "Soltá un documento o hacé click"}
                          </p>
                          <p className="mt-1 text-xs text-white/35">.md · .txt · .docx · .pdf · máx 10MB</p>
                          {exampleFileName ? (
                            <p className="mt-2 text-xs text-primary">
                              {exampleFileName}
                              {exampleFileMeta ? " · se adjuntará el PDF" : ""}
                            </p>
                          ) : null}
                          <input
                            ref={exampleFileRef}
                            type="file"
                            accept={DOCUMENT_ACCEPT}
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleExampleFile(file);
                            }}
                          />
                        </button>
                        <input
                          value={newExampleTitle}
                          onChange={(e) => setNewExampleTitle(e.target.value)}
                          placeholder="Título (ej: Presentación cliente Giuliano)"
                          className="w-full rounded-lg border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                        />
                        <textarea
                          value={newExampleContent}
                          onChange={(e) => setNewExampleContent(e.target.value)}
                          rows={8}
                          placeholder="Pegá el output completo o subí un documento arriba…"
                          className="w-full resize-y rounded-lg border border-white/10 bg-[#0a0a0a] p-3 font-mono text-sm text-white/85 outline-none focus:border-primary/50"
                        />
                        <Button
                          type="button"
                          onClick={handleAddExample}
                          disabled={
                            addingExample ||
                            extractingExample ||
                            !newExampleTitle.trim() ||
                            !newExampleContent.trim()
                          }
                        >
                          {addingExample ? "Guardando…" : "Guardar ejemplo"}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="pb-8">
                    <Button onClick={handleSave} disabled={saving || !dirty}>
                      {saving ? "Guardando…" : saved ? "Guardado" : "Guardar documento"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
