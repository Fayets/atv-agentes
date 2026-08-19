import { useEffect, useState } from "react";
import { getAgentConfig, saveAgentConfig } from "../lib/api";

export default function AgentConfigView({ agent, category, onClose, onStart }) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
              Lógica específica de este agente. El tono de voz es global: está en Estilo, en el menú.
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
