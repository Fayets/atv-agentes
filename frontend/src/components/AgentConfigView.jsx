import { useEffect, useRef, useState } from "react";
import {
  getAgentConfig,
  saveAgentConfig,
  getAgentExamples,
  createAgentExample,
  deleteAgentExample,
  extractExampleDocument,
} from "../lib/api";
import { DOCUMENT_ACCEPT, documentError } from "../lib/read-document";

export default function AgentConfigView({ agent, category, onClose, onStart }) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [examples, setExamples] = useState([]);
  const [newExampleTitle, setNewExampleTitle] = useState("");
  const [newExampleContent, setNewExampleContent] = useState("");
  const [addingExample, setAddingExample] = useState(false);
  const [showAddExample, setShowAddExample] = useState(false);
  const [extractingExample, setExtractingExample] = useState(false);
  const [exampleFileName, setExampleFileName] = useState("");
  const [exampleFileMeta, setExampleFileMeta] = useState(null);
  const [exampleError, setExampleError] = useState("");
  const exampleFileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose?.(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!agent?.id) return;
    setLoading(true);
    getAgentConfig(agent.id)
      .then((data) => {
        setSystemPrompt(data.system_prompt || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agent?.id]);

  useEffect(() => {
    if (!agent?.id) return;
    getAgentExamples(agent.id)
      .then(setExamples)
      .catch(() => {});
  }, [agent?.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await saveAgentConfig(agent.id, "", systemPrompt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddExample = async () => {
    if (!newExampleTitle.trim() || !newExampleContent.trim()) return;
    setAddingExample(true);
    setExampleError("");
    try {
      const created = await createAgentExample(
        agent.id,
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
      console.error(e);
      setExampleError(e?.message || "No se pudo guardar el ejemplo.");
    } finally {
      setAddingExample(false);
    }
  };

  const handleExampleFile = async (file) => {
    const msg = documentError(file);
    if (msg) {
      setExampleError(msg);
      return;
    }
    setExtractingExample(true);
    setExampleError("");
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
      console.error(e);
      setExampleError(e?.message || "No se pudo leer el documento. Probá .md, .txt, .docx o .pdf.");
    } finally {
      setExtractingExample(false);
      if (exampleFileRef.current) exampleFileRef.current.value = "";
    }
  };

  const handleDeleteExample = async (id) => {
    try {
      await deleteAgentExample(id);
      setExamples((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0a0a0a",
      display: "flex", flexDirection: "column", zIndex: 1000,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.25rem 1.5rem", borderBottom: "1px solid #1a1a1a", flexShrink: 0,
      }}>
        <div>
          <p style={{ fontSize: "0.7rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
            {category?.name || category || "Agente"} · Configuración
          </p>
          <h1 style={{ fontSize: "1.1rem", color: "#fff", margin: "0.2rem 0 0", fontWeight: 600 }}>
            {agent?.name || "Agente"}
          </h1>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#555",
          fontSize: "1.2rem", cursor: "pointer", padding: "0.25rem", lineHeight: 1,
        }}>✕</button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#444", fontSize: "0.85rem" }}>Cargando configuración...</p>
        </div>
      ) : (
        <div style={{
          flex: 1, overflow: "auto", padding: "1.5rem",
          maxWidth: "760px", width: "100%", margin: "0 auto",
          boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "1.5rem",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Instrucción del Agente
            </label>
            <p style={{ fontSize: "0.78rem", color: "#444", margin: 0 }}>
              Va primero en el system prompt. Define qué hace el agente, cómo razona y qué estructura tiene el output.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={16}
              style={{
                background: "#111", border: "1px solid #222", borderRadius: "8px",
                color: "#ddd", padding: "1rem", fontSize: "0.82rem",
                resize: "vertical", outline: "none", fontFamily: "monospace", lineHeight: 1.6,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: "0.75rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Ejemplos de Output ({examples.length})
              </label>
              <button
                onClick={() => setShowAddExample(!showAddExample)}
                style={{
                  background: "none", border: "1px solid #333", borderRadius: "6px",
                  color: "#888", padding: "0.3rem 0.75rem", cursor: "pointer",
                  fontSize: "0.75rem",
                }}
              >
                {showAddExample ? "Cancelar" : "+ Agregar ejemplo"}
              </button>
            </div>

            <p style={{ fontSize: "0.78rem", color: "#444", margin: 0 }}>
              Outputs reales o documentos (.md, .txt, .docx, .pdf). El agente los usa como referencia de calidad.
            </p>

            {examples.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {examples.map((ex) => (
                  <div key={ex.id} style={{
                    background: "#111", border: "1px solid #222", borderRadius: "8px",
                    padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.82rem", color: "#fff", margin: "0 0 0.25rem", fontWeight: 600 }}>
                        {ex.title}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "#555", margin: 0 }}>
                        {ex.has_file
                          ? `📎 ${ex.filename || "documento.pdf"}`
                          : `${(ex.content || "").slice(0, 120)}...`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteExample(ex.id)}
                      style={{
                        background: "none", border: "none", color: "#555",
                        cursor: "pointer", fontSize: "1rem", padding: "0 0 0 0.75rem", flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddExample && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem", background: "#0f0f0f", borderRadius: "8px", border: "1px solid #222" }}>
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
                  style={{
                    background: "#111", border: "1px dashed #333", borderRadius: "8px",
                    color: "#888", padding: "1.25rem", cursor: extractingExample ? "wait" : "pointer",
                    fontSize: "0.82rem", textAlign: "center",
                  }}
                >
                  {extractingExample
                    ? "Leyendo documento…"
                    : "Soltá un documento o hacé click (.md · .txt · .docx · .pdf)"}
                  {exampleFileName ? (
                    <span style={{ display: "block", marginTop: "0.4rem", color: "#c0392b", fontSize: "0.75rem" }}>
                      {exampleFileName}
                      {exampleFileMeta ? " · se adjuntará el PDF" : ""}
                    </span>
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
                {exampleError ? (
                  <p style={{ fontSize: "0.78rem", color: "#e74c3c", margin: 0 }}>{exampleError}</p>
                ) : null}
                <input
                  value={newExampleTitle}
                  onChange={(e) => setNewExampleTitle(e.target.value)}
                  placeholder="Título del ejemplo (ej: Presentación cliente Giuliano)"
                  style={{
                    background: "#111", border: "1px solid #222", borderRadius: "8px",
                    color: "#ddd", padding: "0.6rem 0.75rem", fontSize: "0.82rem",
                    outline: "none", fontFamily: "inherit",
                  }}
                />
                <textarea
                  value={newExampleContent}
                  onChange={(e) => setNewExampleContent(e.target.value)}
                  placeholder="Pegá el output completo o subí un documento arriba..."
                  rows={8}
                  style={{
                    background: "#111", border: "1px solid #222", borderRadius: "8px",
                    color: "#ddd", padding: "0.75rem", fontSize: "0.82rem",
                    resize: "vertical", outline: "none", fontFamily: "monospace", lineHeight: 1.6,
                  }}
                />
                <button
                  onClick={handleAddExample}
                  disabled={
                    addingExample ||
                    extractingExample ||
                    !newExampleTitle.trim() ||
                    !newExampleContent.trim()
                  }
                  style={{
                    background: addingExample ? "#1a1a1a" : "#c0392b",
                    color: addingExample ? "#444" : "#fff",
                    border: "none", borderRadius: "8px", padding: "0.7rem",
                    cursor: addingExample ? "not-allowed" : "pointer",
                    fontSize: "0.85rem", fontWeight: 600,
                  }}
                >
                  {addingExample ? "Guardando..." : "Guardar ejemplo"}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", paddingBottom: "2rem" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? "#1a1a1a" : "#222", color: saving ? "#444" : "#fff",
                border: "1px solid #333", borderRadius: "8px", padding: "0.75rem 1.5rem",
                cursor: saving ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 600,
              }}
            >
              {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
            </button>
            <button
              onClick={onStart}
              style={{
                background: "#c0392b", color: "#fff", border: "none",
                borderRadius: "8px", padding: "0.75rem 1.5rem",
                cursor: "pointer", fontSize: "0.85rem", fontWeight: 600,
              }}
            >
              Ir al agente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
