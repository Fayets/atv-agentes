/**
 * Single switch for mock → real backend.
 * Flip to false when FastAPI routes are ready.
 */
const USE_MOCK = true;

const BASE = import.meta.env.VITE_API_URL || "";

export const CATEGORIES = ["marketing", "bases", "ventas", "escala"];

export const CATEGORY_LABELS = {
  marketing: "Marketing",
  bases: "Bases",
  ventas: "Ventas",
  escala: "Escala",
};

export const CATEGORY_COLORS = {
  marketing: "#FF5A1F",
  bases: "#C9A0FF",
  ventas: "#E8A84A",
  escala: "#7EC8FF",
};

/**
 * Agentes reales del mapa (por ahora).
 * Backend futuro: GET /api/agents?client_id=X&category=Y
 */
export const CATEGORY_AGENTS = {
  marketing: [
    { id: "mk1", name: "Calendario de Contenido", icon: "chart" },
    { id: "mk2", name: "Secuencia de Stories", icon: "send" },
    { id: "mk3", name: "Optimización de Perfil", icon: "check" },
    { id: "mk4", name: "Estrategia de Contenido", icon: "doc" },
    { id: "mk5", name: "YouTube / Creator", icon: "mic" },
  ],
  bases: [{ id: "bs1", name: "Oferta y Escalera de Valor", icon: "tag" }],
  ventas: [
    { id: "vt1", name: "Proceso de Setting", icon: "users" },
    { id: "vt2", name: "Proceso de Preaudit (trigger)", icon: "search" },
    { id: "vt3", name: "Proceso de Venta (call)", icon: "chat" },
    { id: "vt4", name: "VSL Chat", icon: "send" },
    { id: "vt5", name: "Presentación de Resultados", icon: "chart" },
    { id: "vt6", name: "Landing (Thank You)", icon: "flow" },
  ],
  escala: [
    { id: "es1", name: "Estrategia de Ads", icon: "bell" },
    { id: "es2", name: "Estructura y Presentación de Webinar", icon: "building" },
  ],
};

function buildDefaultAgentDoc(agent = {}, category = "") {
  const name = agent.name || "Agente";
  const label = CATEGORY_LABELS[category] || category || "Grounded";
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    code: name.toUpperCase(),
    title: `${name} · ${label}`,
    badge: "ANTES DE TODO",
    tagline: `El hub que ${label.toLowerCase()} lee y escribe.`,
    intro: `${name} opera sobre la base de conocimiento de ${label}. Lee el contexto del cliente, ejecuta su skill y deja trazabilidad en la KB.`,
    assetsLabel: "2 skills reutilizables — tuyas para descargar",
    files: [`${slug}.md`, "playbook.md", "inputs/", "outputs/", "SCORE.md"],
    replaces: `Reemplaza tareas manuales repetidas en ${label.toLowerCase()} y el conocimiento atrapado en chats o planillas sueltas.`,
    ladder: [
      {
        stage: "LIDERADO POR HUMANOS",
        text: "El humano decide; el agente prepara inputs y deja el rastro en la KB.",
      },
      {
        stage: "ASISTIDO",
        text: "El agente propone el trabajo; el humano aprueba antes de impactar.",
      },
      {
        stage: "AUTÓNOMO",
        text: "Corre dentro de reglas. El humano revisa métricas y excepciones.",
      },
    ],
    human: `Alguien de ${label} es dueño del SCORE.md de este agente. Sin owner, no hay autonomía segura.`,
    buildNotes:
      "Skill en Markdown + checklist. Sin side-effects fuera de la KB hasta que el status pase a LIVE.",
    skills: [
      {
        title: `${name} — skill builder`,
        desc: `Define el loop de trabajo de ${name} y cómo escribe en la KB.`,
        link: "LEER SKILL.MD",
      },
      {
        title: `${name} — runner`,
        desc: "Ejecuta el skill con el contexto del cliente y registra el resultado.",
        link: "LEER SKILL.MD",
      },
    ],
    status: "development",
  };
}

export function getAgentDoc(agentId, agentMeta = {}, category = "") {
  const base = buildDefaultAgentDoc(agentMeta, category);
  return {
    id: agentId,
    category,
    name: agentMeta.name || base.code,
    icon: agentMeta.icon || "flow",
    ...base,
  };
}

const MOCK_CLIENTS = [
  { id: "c1", name: "ATV Soft", slug: "atv-soft" },
  { id: "c2", name: "Coquetines", slug: "coquetines" },
  { id: "c3", name: "Paula & Lorena", slug: "paula-lorena" },
];

const MOCK_ENTRY_SEED = {
  c1: [],
  c2: [],
  c3: [],
};

let mockUser = null;
let mockEntriesByClient = structuredClone(MOCK_ENTRY_SEED);
let mockIdSeq = 100;

function delay(ms = 180) {
  return new Promise((r) => setTimeout(r, ms));
}

function clone(value) {
  return structuredClone(value);
}

async function realFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function listEntries(clientId) {
  return (mockEntriesByClient[clientId] || []).map(({ content, ...rest }) => rest);
}

function getEntry(id) {
  for (const entries of Object.values(mockEntriesByClient)) {
    const found = entries.find((e) => e.id === id);
    if (found) return clone(found);
  }
  return null;
}

function computeStats(clientId) {
  const entries = mockEntriesByClient[clientId] || [];
  const by_status = { processing: 0, live: 0, error: 0 };
  const catMap = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const e of entries) {
    by_status[e.status] = (by_status[e.status] || 0) + 1;
    catMap[e.category] = (catMap[e.category] || 0) + 1;
  }
  return {
    total: entries.length,
    by_status,
    by_category: CATEGORIES.map((category) => ({
      category,
      count: catMap[category],
    })),
  };
}

/** Advance mock processing → live so polling feels real */
function tickProcessing(clientId) {
  const entries = mockEntriesByClient[clientId];
  if (!entries) return;
  for (const e of entries) {
    if (e.status === "processing" && e._ticks != null) {
      e._ticks += 1;
      if (e._ticks >= 2) {
        e.status = "live";
        e.excerpt = e.excerpt?.replace(/Procesando.*/, "Listo.") || "Documento indexado.";
        e.content =
          e.content ||
          `# ${e.title}\n\nContenido extraído de ${e.filename}.`;
        delete e._ticks;
      }
    }
  }
}

export async function getMe() {
  if (!USE_MOCK) return realFetch("/api/auth/me");
  await delay();
  return mockUser ? clone(mockUser) : null;
}

export async function login({ email, password }) {
  if (!USE_MOCK) {
    return realFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  }
  await delay(280);
  if (!email || !password) {
    const err = new Error("Credenciales inválidas");
    err.status = 401;
    throw err;
  }
  // Por ahora siempre entramos como lo vería el cliente (ATV Soft)
  mockUser = {
    id: "u2",
    email,
    role: "client_admin",
    client_id: "c1",
  };
  return { ok: true };
}

export async function logout() {
  if (!USE_MOCK) {
    return realFetch("/api/auth/logout", { method: "POST" });
  }
  await delay(120);
  mockUser = null;
  return null;
}

export async function getClients() {
  if (!USE_MOCK) return realFetch("/api/clients");
  await delay();
  return clone(MOCK_CLIENTS);
}

export async function getKbEntries(clientId) {
  if (!USE_MOCK) {
    return realFetch(`/api/kb/entries?client_id=${encodeURIComponent(clientId)}`);
  }
  await delay();
  tickProcessing(clientId);
  return clone(listEntries(clientId));
}

export async function getKbEntry(id) {
  if (!USE_MOCK) return realFetch(`/api/kb/entries/${id}`);
  await delay();
  const entry = getEntry(id);
  if (!entry) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  return entry;
}

export async function uploadKbEntry({ file, clientId, category }) {
  if (!USE_MOCK) {
    const form = new FormData();
    form.append("file", file);
    form.append("client_id", clientId);
    form.append("category", category);
    return realFetch("/api/kb/upload", { method: "POST", body: form });
  }
  await delay(320);
  if (!mockEntriesByClient[clientId]) mockEntriesByClient[clientId] = [];
  const id = `e${mockIdSeq++}`;
  const ext = (file.name.split(".").pop() || "txt").toLowerCase();
  const entry = {
    id,
    category,
    title: file.name.replace(/\.[^.]+$/, ""),
    status: "processing",
    source_type: ext,
    filename: file.name,
    created_at: new Date().toISOString(),
    excerpt: `Procesando ${file.name}…`,
    content: "",
    _ticks: 0,
  };
  mockEntriesByClient[clientId].unshift(entry);
  return { id, status: "processing" };
}

export async function deleteKbEntry(id) {
  if (!USE_MOCK) {
    return realFetch(`/api/kb/entries/${id}`, { method: "DELETE" });
  }
  await delay(160);
  for (const clientId of Object.keys(mockEntriesByClient)) {
    const before = mockEntriesByClient[clientId].length;
    mockEntriesByClient[clientId] = mockEntriesByClient[clientId].filter(
      (e) => e.id !== id
    );
    if (mockEntriesByClient[clientId].length !== before) return null;
  }
  return null;
}

export async function getKbStats(clientId) {
  if (!USE_MOCK) {
    return realFetch(`/api/kb/stats?client_id=${encodeURIComponent(clientId)}`);
  }
  await delay();
  return clone(computeStats(clientId));
}

export function getClientById(id) {
  return MOCK_CLIENTS.find((c) => c.id === id) || null;
}

export function apiClientId(clientId) {
  return clientId === "c1" ? "test" : clientId || "test";
}

export async function runAgent(clientId, agentId, inputDoc, files = []) {
  return realFetch("/api/agents/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiClientId(clientId),
      agent_id: agentId,
      input_doc: inputDoc || "",
      files,
    }),
  });
}

export async function chatAgent(sessionId, message, files = []) {
  return realFetch("/api/agents/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: message || "", files }),
  });
}

export async function getAgentHistory(sessionId) {
  return realFetch(`/api/agents/history/${sessionId}`);
}

export async function listAgentSessions(clientId, agentId) {
  const params = new URLSearchParams({
    client_id: apiClientId(clientId),
    agent_id: agentId,
  });
  return realFetch(`/api/agents/sessions?${params}`);
}

export async function getLatestAgentSession(clientId, agentId) {
  const params = new URLSearchParams({
    client_id: apiClientId(clientId),
    agent_id: agentId,
  });
  return realFetch(`/api/agents/sessions/latest?${params}`);
}

export async function listAgents() {
  return realFetch("/api/agents/catalog");
}

export async function getAgentConfig(agentId) {
  return realFetch(`/api/agents/config/${agentId}`);
}

export async function saveAgentConfig(agentId, toneDoc, systemPrompt) {
  return realFetch(`/api/agents/config/${agentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tone_doc: toneDoc || "", system_prompt: systemPrompt }),
  });
}

export async function getToneDoc() {
  return realFetch("/api/agents/tone");
}

export async function saveToneDoc(toneDoc) {
  return realFetch("/api/agents/tone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tone_doc: toneDoc }),
  });
}

export async function getClaudeStatus() {
  return realFetch("/api/agents/claude");
}

export async function saveClaudeKey(apiKey) {
  return realFetch("/api/agents/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
}
