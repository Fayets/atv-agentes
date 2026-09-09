import { CATEGORY_AGENTS, CATEGORY_COLORS, CATEGORY_LABELS } from "./api";

/** Busca un agente por id en el catálogo estático del mapa. */
export function findAgent(agentId) {
  for (const [category, list] of Object.entries(CATEGORY_AGENTS)) {
    const agent = list.find((a) => a.id === agentId);
    if (agent) return { agent, category };
  }
  return null;
}

/** Los 14 agentes, planos, con su categoría. */
export function allAgents() {
  return Object.entries(CATEGORY_AGENTS).flatMap(([category, list]) =>
    list.map((agent) => ({ ...agent, category }))
  );
}

/** Qué hace cada agente, en una línea, para las tarjetas y el plantel. */
export const AGENT_ROLES = {
  mk1: "Arma el calendario semanal de contenido",
  mk2: "Escribe las secuencias de historias",
  mk3: "Optimiza el perfil de Instagram",
  mk4: "Define la dirección de contenido de la semana",
  mk5: "Guiones e ideas para YouTube",
  mk6: "Escribe el guion del reel a partir de la idea de Calendario",
  bs1: "Diagnostica el negocio y arma la escalera de valor",
  vt1: "Guion y proceso de setting",
  vt2: "Trigger de preaudit antes de la call",
  vt3: "El proceso de la llamada de venta",
  vt4: "VSL conversacional por chat",
  vt5: "El deck que se usa en la call de venta",
  vt6: "Landing de gracias después de agendar",
  es1: "Estrategia de anuncios pagos",
  es2: "Estructura y presentación del webinar",
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || "#ffffff";
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category || "";
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const YT_RE = /(youtube\.com|youtu\.be)/i;
const IG_RE = /instagram\.com/i;

/**
 * Espejo de scrape_service.detect_platform: qué enlaces del brief va a leer el
 * backend. Solo para mostrarlos en la actividad; el scraping real pasa del
 * otro lado.
 */
export function detectReferences(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").match(URL_RE) || []) {
    const url = raw.replace(/[.,;]+$/, "");
    const platform = YT_RE.test(url) ? "youtube" : IG_RE.test(url) ? "instagram" : null;
    if (!platform || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, platform });
  }
  return out;
}

/**
 * Espejo de MODEL_BY_AGENT del backend, solo para mostrar. Si el backend
 * cambia el modelo de un agente, esto es lo único que hay que tocar acá.
 */
export function modelForAgent(agentId, defaultModel) {
  if (agentId === "vt5") return "claude-opus-5";
  return defaultModel || "";
}

/** "claude-sonnet-4-6" → "Sonnet 4.6", "claude-opus-5" → "Opus 5". */
export function shortModel(model) {
  const m = /claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(model || "");
  if (!m) return model || "Claude";
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

export function formatElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function formatChars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
