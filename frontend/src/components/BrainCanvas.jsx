import { useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_AGENTS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from "../lib/api";
import "./BrainCanvas.css";

const R1 = 215; // hub → category root
const R_RING = R1 + 195; // radio base de las puntas (silueta tipo reel)
const START_DEG = -90;
const TREE_DEPTH = 4;
const TREE_LEN0 = 78;
const SECTOR_DEG = 360 / CATEGORIES.length;
const RING_LIMBS = 7; // extremidades primarias tipo neurona biológica

const CATEGORY_META = {
  marketing: { sub: "contenido · perfil · creator", icon: "mic" },
  bases: { sub: "oferta · escalera de valor", icon: "tag" },
  ventas: { sub: "setting · call · cierre", icon: "chat" },
  escala: { sub: "ads · webinar", icon: "chart" },
};

/* Colores del núcleo tipo grafo (referencia: salmon / sky / pale yellow / white) */
const CORE_COLORS = ["#FFFFFF", "#F0A090", "#8EC5E8", "#E8D49A", "#D4B8E8", "#A8C4D8"];

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function polar(cx, cy, r, deg) {
  const a = degToRad(deg);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seeded(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function iconPath(kind) {
  switch (kind) {
    case "building":
      return "M-5 6 V-4 H5 V6 M-2 -1 H2 M-2 2 H2 M-2 5 H2";
    case "tag":
      return "M-5 -2 L2 -2 L6 2 L2 6 L-5 6 Z M-2 1.5 a1.2 1.2 0 1 0 0.01 0";
    case "users":
      return "M-3 -2 a2.2 2.2 0 1 0 0.01 0 M3 -2 a2.2 2.2 0 1 0 0.01 0 M-6 6 c0-2.4 1.8-3.5 3.5-3.5 S1 3.6 1 6 M2 6 c0-2.4 1.8-3.5 3.5-3.5 S9 3.6 9 6";
    case "mic":
      return "M0 -5 a2.2 3 0 0 1 0 6 a2.2 3 0 0 1 0 -6 M-3.5 1.5 c0 2.2 1.6 3.5 3.5 3.5 s3.5 -1.3 3.5 -3.5 M0 5 V7";
    case "flow":
      return "M-5 -3 H-1 V1 H3 V5 H6 M-5 1 H-1 M3 -3 H6";
    case "chat":
      return "M-5 -3 H5 V3 H1 L-2 6 V3 H-5 Z";
    case "doc":
      return "M-4 -6 H2 L4 -4 V6 H-4 Z M-1.5 -1 H1.5 M-1.5 2 H1.5";
    case "gear":
      return "M0 -6 V-4 M0 4 V6 M-6 0 H-4 M4 0 H6 M-4.2 -4.2 L-2.8 -2.8 M2.8 2.8 L4.2 4.2 M-4.2 4.2 L-2.8 2.8 M2.8 -2.8 L4.2 -4.2 M0 -2.5 a2.5 2.5 0 1 0 0.01 0";
    case "search":
      return "M-1 -1 m-3.2 0 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 M1.6 1.6 L5 5";
    case "bell":
      return "M-4 3 C-4 -1 -3 -4.5 0 -4.5 C3 -4.5 4 -1 4 3 Z M-1.5 5 a1.5 1.5 0 0 0 3 0";
    case "db":
      return "M-4 -4 a4 1.8 0 1 0 8 0 a4 1.8 0 1 0 -8 0 M-4 -4 V4 a4 1.8 0 0 0 8 0 V-4 M-4 0 a4 1.8 0 0 0 8 0";
    case "chart":
      return "M-5 5 H5 M-3 5 V0 M0 5 V-3 M3 5 V1";
    case "send":
      return "M-5 0 L5 -4 L1 5 L-0.5 0.5 Z";
    case "check":
      return "M0 -5.5 a5.5 5.5 0 1 0 0.01 0 M-2.4 0 L-0.6 1.8 L2.6 -1.8";
    default:
      return "M-3 0 H3 M0 -3 V3";
  }
}

function wrapLabel(str, max = 18) {
  const words = String(str).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Una rama por agente: abiertas, con codo, no un abanico recto. */
function layoutAgentFan(branch, root, agents, color, seedKey, callbacksRef, category) {
  const svgNS = "http://www.w3.org/2000/svg";
  const n = agents.length;
  if (!n) return;

  const trunk = polar(root.x, root.y, 36, -90);
  drawCurvePath(branch, [root, trunk], "rgba(255,255,255,0.78)", 2);

  const gap = n <= 2 ? 210 : n <= 4 ? 168 : 152;
  const span = (n - 1) * gap;
  const x0 = root.x - span / 2;

  agents.forEach((agent, i) => {
    const fromCenter = i - (n - 1) / 2;
    const side = fromCenter === 0 ? (seeded(seedKey + i) > 0.5 ? 1 : -1) : Math.sign(fromCenter);
    const tipX = x0 + i * gap + (seeded(seedKey + i * 3) - 0.5) * 18;
    const tipY = root.y - (210 + Math.abs(fromCenter) * 28 + seeded(seedKey + i * 11) * 36);
    const tip = { x: tipX, y: tipY };

    // Codos tipo dendrita: no van en línea recta
    const j1 = {
      x: trunk.x + fromCenter * 22 + side * (18 + seeded(seedKey + i * 5) * 16),
      y: trunk.y - (48 + seeded(seedKey + i * 7) * 22),
    };
    const j2 = {
      x: tip.x - side * (36 + seeded(seedKey + i * 9) * 28),
      y: (j1.y + tip.y) / 2 + (seeded(seedKey + i * 13) - 0.5) * 24,
    };

    const pts = [trunk, j1, j2, tip];
    drawCurvePath(branch, pts, "rgba(255,255,255,0.82)", 1.55);
    drawDot(branch, j1, 1.7, "#FFFFFF", 0.7);
    drawDot(branch, j2, 1.7, "#FFFFFF", 0.7);

    const nameLines = wrapLabel(agent.name, 15);
    const node = document.createElementNS(svgNS, "g");
    node.setAttribute("class", "brain-agent");
    node.style.cursor = "pointer";
    node.style.setProperty("--pulse", `${(i % 3) * 0.55}s`);
    node.innerHTML = `
      <circle cx="${tip.x}" cy="${tip.y}" r="22" fill="transparent"/>
      <circle class="brain-agent-halo" cx="${tip.x}" cy="${tip.y}" r="11" fill="${color}" fill-opacity="0.28"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="5" fill="#FFFFFF"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="2.2" fill="${color}"/>
      ${nameLines
        .map(
          (ln, li) =>
            `<text x="${tip.x}" y="${tip.y - 20 - (nameLines.length - 1 - li) * 13}" text-anchor="middle" class="brain-agent-name">${escapeXml(ln)}</text>`
        )
        .join("")}
    `;
    node.addEventListener("click", (ev) => {
      ev.stopPropagation();
      callbacksRef.current.onAgentClick?.(agent, category);
    });
    branch.appendChild(node);
  });
}

function splitAgentLanes(agents) {
  const n = agents.length;
  if (n <= 2) return [agents];
  const cols = n <= 4 ? 2 : 3;
  const size = Math.ceil(n / cols);
  const lanes = [];
  for (let i = 0; i < cols; i++) {
    const slice = agents.slice(i * size, (i + 1) * size);
    if (slice.length) lanes.push(slice);
  }
  return lanes;
}

function laneOffsets(count) {
  if (count <= 1) return [0];
  if (count === 2) return [-260, 260];
  return [-320, 0, 320];
}

function pointOnSegment(from, to, dist) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dist / len, 0.48);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function lineLen(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Cheap fingerprint so we don't rebuild SVG on identical polls */
export function entriesSignature(entries) {
  return (entries || [])
    .map((e) => `${e.id}:${e.status}:${e.category}:${e.title}`)
    .join("|");
}

/**
 * Brain map — optimized: CSS orbit (no rAF), few filters, skip rebuild if unchanged.
 */
export default function BrainCanvas({
  clientName,
  entries = [],
  error = null,
  onRetry,
  onLeafClick,
  onGhostClick,
  onAgentClick,
}) {
  const shellRef = useRef(null);
  const viewportRef = useRef(null);
  const callbacksRef = useRef({ onLeafClick, onGhostClick, onRetry, onAgentClick });
  const stateRef = useRef({ x: 0, y: 0, scale: 0.68 });
  const lastSigRef = useRef("");
  const introDoneRef = useRef(false);
  // número = una neurona (vista inicial, se navega con flechas) · "map" = anillo radial
  const [view, setView] = useState(0);
  // true = neurona abierta mostrando sus agentes (Enter/clic sobre la raíz)
  const [openNeuron, setOpenNeuron] = useState(false);
  const prevViewRef = useRef(null);
  const prevOpenRef = useRef(false);
  const lastFocusRef = useRef(0);

  useEffect(() => {
    callbacksRef.current = { onLeafClick, onGhostClick, onRetry, onAgentClick };
  }, [onLeafClick, onGhostClick, onRetry, onAgentClick]);

  useEffect(() => {
    if (typeof view === "number") lastFocusRef.current = view;
    else setOpenNeuron(false);
  }, [view]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        // Escape: agentes → neurona → anillo → neurona
        if (openNeuron) setOpenNeuron(false);
        else setView((v) => (typeof v === "number" ? "map" : lastFocusRef.current));
      } else if (typeof view === "number") {
        if (e.key === "Enter") setOpenNeuron((o) => !o);
        else if (!openNeuron && e.key === "ArrowLeft")
          setView((v) => (v + CATEGORIES.length - 1) % CATEGORIES.length);
        else if (!openNeuron && e.key === "ArrowRight")
          setView((v) => (v + 1) % CATEGORIES.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, openNeuron]);

  // Pan / zoom / touch — once
  useEffect(() => {
    const shell = shellRef.current;
    const viewport = viewportRef.current;
    if (!shell || !viewport) return;

    function applyTransform() {
      const { x, y, scale } = stateRef.current;
      viewport.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    }
    applyTransform();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    function onPointerDown(e) {
      if (e.target.closest(".brain-leaf, .brain-ghost, .brain-agent, .brain-zoom, button, .brain-root"))
        return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      shell.classList.add("is-panning");
      shell.setPointerCapture?.(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      stateRef.current.x += e.clientX - lastX;
      stateRef.current.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      applyTransform();
    }

    function onPointerUp(e) {
      dragging = false;
      shell.classList.remove("is-panning");
      try {
        shell.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      stateRef.current.scale = clamp(stateRef.current.scale * delta, 0.35, 1.8);
      applyTransform();
    }

    function distance(t1, t2) {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinchStartDist = distance(e.touches[0], e.touches[1]);
        pinchStartScale = stateRef.current.scale;
      }
    }

    function onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = distance(e.touches[0], e.touches[1]);
        if (pinchStartDist > 0) {
          stateRef.current.scale = clamp(
            pinchStartScale * (d / pinchStartDist),
            0.35,
            1.8
          );
          applyTransform();
        }
      }
    }

    function zoomBy(factor) {
      stateRef.current.scale = clamp(stateRef.current.scale * factor, 0.35, 1.8);
      applyTransform();
    }

    function resetView() {
      stateRef.current = { x: 0, y: 0, scale: 0.68 };
      applyTransform();
    }

    const zoomIn = shell.querySelector("[data-zoom='in']");
    const zoomOut = shell.querySelector("[data-zoom='out']");
    const zoomReset = shell.querySelector("[data-zoom='reset']");
    const onIn = () => zoomBy(1.15);
    const onOut = () => zoomBy(1 / 1.15);

    zoomIn?.addEventListener("click", onIn);
    zoomOut?.addEventListener("click", onOut);
    zoomReset?.addEventListener("click", resetView);
    shell.addEventListener("pointerdown", onPointerDown);
    shell.addEventListener("pointermove", onPointerMove);
    shell.addEventListener("pointerup", onPointerUp);
    shell.addEventListener("pointercancel", onPointerUp);
    shell.addEventListener("wheel", onWheel, { passive: false });
    shell.addEventListener("touchstart", onTouchStart, { passive: true });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      zoomIn?.removeEventListener("click", onIn);
      zoomOut?.removeEventListener("click", onOut);
      zoomReset?.removeEventListener("click", resetView);
      shell.removeEventListener("pointerdown", onPointerDown);
      shell.removeEventListener("pointermove", onPointerMove);
      shell.removeEventListener("pointerup", onPointerUp);
      shell.removeEventListener("pointercancel", onPointerUp);
      shell.removeEventListener("wheel", onWheel);
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const sig = `${clientName}::${view}::${openNeuron}::${entriesSignature(entries)}`;
    const prevView = prevViewRef.current;
    const prevOpen = prevOpenRef.current;
    const viewChanged = prevView !== view || prevOpen !== openNeuron;
    if (sig === lastSigRef.current && viewport.querySelector(".brain-svg")) {
      return;
    }
    lastSigRef.current = sig;
    prevViewRef.current = view;
    prevOpenRef.current = openNeuron;

    const W = 1800;
    const H = 1800;
    const CX = W / 2;
    const CY = H / 2;

    // Animaciones pesadas solo donde aportan; al pasar de neurona NO se redibujan caminos
    const openingAgents = openNeuron && !prevOpen;
    const toMap = view === "map" && prevView !== "map";
    const switchingNeuron =
      typeof view === "number" &&
      typeof prevView === "number" &&
      view !== prevView &&
      !openNeuron;
    const playFlight = !introDoneRef.current || toMap;
    const playPaths = openingAgents;
    const playIntro = playFlight || playPaths;
    const fadeSvg = switchingNeuron || openingAgents;

    viewport.innerHTML = "";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // Fade corto al cambiar neurona; el anillo usa vuelo, no fade global
    svg.setAttribute("class", fadeSvg ? "brain-svg brain-svg--enter" : "brain-svg");
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));

    const world = document.createElementNS(svgNS, "g");
    world.setAttribute("class", "brain-world");
    svg.appendChild(world);

    const drawables = [];

    if (view === "map") {
    // ============ ANILLO RADIAL COMPLETO ============
    const hub = document.createElementNS(svgNS, "g");
    hub.setAttribute("class", "brain-hub");
    hub.setAttribute("transform", `translate(${CX} ${CY})`);
    // Núcleo tipo grafo denso (estático — sin filtros ni animación continua)
    buildBrainCore(hub, 11);
    if (playFlight) {
      hub.classList.add("brain-reveal");
      hub.style.setProperty("--delay", "0.9s");
    }
    world.appendChild(hub);

    if (!entries.length) {
      const hint = document.createElementNS(svgNS, "text");
      hint.setAttribute("x", String(CX));
      hint.setAttribute("y", String(CY + 118));
      hint.setAttribute("text-anchor", "middle");
      hint.setAttribute("class", "brain-empty-hint");
      hint.textContent = "Cargá el primer documento para empezar";
      world.appendChild(hint);
    }

    // Polvo de partículas núcleo → neurona (sin líneas duras)
    const stems = document.createElementNS(svgNS, "g");
    stems.setAttribute("class", "brain-stems");
    world.appendChild(stems);

    // Slot en la fila según posición final en el anillo → los vuelos no se cruzan
    const ringOrder = CATEGORIES.map((_, j) => ({
      j,
      p: polar(CX, CY, R1, START_DEG + j * SECTOR_DEG),
    }))
      .sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y)
      .map((o) => o.j);
    const rowSlot = [];
    ringOrder.forEach((j, slot) => {
      rowSlot[j] = slot;
    });

    CATEGORIES.forEach((category, i) => {
      const baseDeg = START_DEG + i * SECTOR_DEG;
      const color = CATEGORY_COLORS[category];
      const meta = CATEGORY_META[category];
      const root = polar(CX, CY, R1, baseDeg);
      const catEntries = entries.filter((e) => e.category === category);
      const seedKey = i * 97 + 11;

      const branch = document.createElementNS(svgNS, "g");
      branch.setAttribute("class", "brain-branch");
      branch.dataset.category = category;

      drawStemDust(stems, CX, CY, root, color, seedKey, playFlight, 0.95 + i * 0.04);

      // Category root with soft halo
      const rootNode = document.createElementNS(svgNS, "g");
      rootNode.setAttribute("class", "brain-root");
      rootNode.innerHTML = `
        <circle cx="${root.x}" cy="${root.y}" r="26" fill="${color}" fill-opacity="0.22"/>
        <circle cx="${root.x}" cy="${root.y}" r="16" fill="${color}" stroke="rgba(255,255,255,0.45)" stroke-width="1.4"/>
        <path d="${iconPath(meta.icon)}" transform="translate(${root.x} ${root.y})" fill="none" stroke="#FFFFFF" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      // Clic en la raíz → la neurona se "abre" (vista focus del reel)
      rootNode.style.cursor = "pointer";
      rootNode.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setView(i);
      });
      branch.appendChild(rootNode);

      // Labels fuera del anillo de dendritas (como el reel)
      const labelPos = polar(CX, CY, R_RING + 52, baseDeg);
      const c = Math.cos(degToRad(baseDeg));
      const s = Math.sin(degToRad(baseDeg));
      const labelAnchor = c > 0.35 ? "start" : c < -0.35 ? "end" : "middle";
      const lyNudge = Math.abs(s) > 0.85 ? (s > 0 ? 8 : -6) : 0;
      const label = document.createElementNS(svgNS, "g");
      if (playFlight) {
        label.setAttribute("class", "brain-reveal");
        label.style.setProperty("--delay", `${0.9 + i * 0.03}s`);
      }
      label.innerHTML = `
        <text x="${labelPos.x}" y="${labelPos.y - 4 + lyNudge}" text-anchor="${labelAnchor}" class="brain-cat-title">${CATEGORY_LABELS[category]}</text>
        <text x="${labelPos.x}" y="${labelPos.y + 14 + lyNudge}" text-anchor="${labelAnchor}" class="brain-cat-sub">${escapeXml(meta.sub)}</text>
      `;
      branch.appendChild(label);

      // Dendritas ordenadas: N espinas → puntas en radio común (círculo limpio)
      layoutRingDendrites(
        branch,
        root,
        baseDeg,
        catEntries,
        color,
        seedKey,
        callbacksRef,
        drawables,
        !catEntries.length,
        { cx: CX, cy: CY, rOuter: R_RING, halfSpan: SECTOR_DEG / 2 }
      );

      // Vuelo línea → anillo: solo al entrar al mapa (transform = GPU)
      if (playFlight) {
        const slot = rowSlot[i];
        const rowX = CX + (slot - (CATEGORIES.length - 1) / 2) * 260;
        const rowY = CY + 130;
        let spin = -90 - baseDeg;
        spin = ((spin + 540) % 360) - 180;
        branch.classList.add("brain-flight");
        branch.style.transformOrigin = `${root.x}px ${root.y}px`;
        branch.style.transform = `translate(${rowX - root.x}px, ${rowY - root.y}px) rotate(${spin}deg)`;
        branch.style.transition = "transform 0.85s cubic-bezier(0.33, 0.8, 0.2, 1)";
      }

      world.appendChild(branch);
    });
    } else if (openNeuron) {
      // ============ ADENTRO DE LA NEURONA — agentes (caminos que se forman) ============
      const category = CATEGORIES[view];
      const color = CATEGORY_COLORS[category];
      const meta = CATEGORY_META[category];
      const agents = CATEGORY_AGENTS[category] || [];
      const agentCount = agents.length;
      const lanes = splitAgentLanes(agents);
      // Subido para que la raíz y el subtítulo no queden bajo el pill del carousel
      const root = { x: CX, y: CY + 260 };

      // Marca de agua gigante detrás (referencia: "SALES")
      const watermark = document.createElementNS(svgNS, "text");
      watermark.setAttribute("x", String(CX));
      watermark.setAttribute("y", String(CY + 80));
      watermark.setAttribute("text-anchor", "middle");
      watermark.setAttribute("class", "brain-watermark");
      watermark.textContent = CATEGORY_LABELS[category];
      world.appendChild(watermark);

      const group = document.createElementNS(svgNS, "g");
      const laneXs = laneOffsets(lanes.length);

      lanes.forEach((laneAgents, p) => {
        const colX = CX + (laneXs[p] ?? 0);
        let prev = root;
        const headingTop = CY - 320;

        laneAgents.forEach((agent, s) => {
          const isLast = s === laneAgents.length - 1;
          const t = (s + 1) / (laneAgents.length + 0.35);
          const targetY = root.y - 90 - t * (root.y - headingTop - 40);
          const pos = {
            x: colX,
            y: targetY,
          };
          if (!isLast) {
            pos.x = prev.x + (colX - prev.x) * (0.55 + s * 0.12);
          }

          const delay = playPaths ? 0.02 + s * 0.1 : 0;
          const fromR = prev === root ? 32 : 24;
          const a = pointOnSegment(prev, pos, fromR);
          const b = pointOnSegment(pos, prev, 24);
          drawables.push(
            drawLine(group, a, b, "rgba(200,210,230,0.55)", 1.8, delay, 0.22)
          );

          const nameLines = wrapLabel(agent.name, 18);

          const node = document.createElementNS(svgNS, "g");
          node.setAttribute("class", playPaths ? "brain-agent brain-reveal" : "brain-agent");
          node.style.cursor = "pointer";
          if (playPaths) node.style.setProperty("--delay", `${delay + 0.14}s`);
          node.innerHTML = `
            <circle cx="${pos.x}" cy="${pos.y}" r="24" fill="#F2EEE8"/>
            <circle cx="${pos.x}" cy="${pos.y}" r="24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
            <path d="${iconPath(agent.icon)}" transform="translate(${pos.x} ${pos.y}) scale(1.55)" fill="none" stroke="#2A2430" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
            ${nameLines
              .map(
                (ln, li) =>
                  `<text x="${pos.x}" y="${pos.y + 42 + li * 13}" text-anchor="middle" class="brain-agent-name">${escapeXml(ln)}</text>`
              )
              .join("")}
          `;
          node.addEventListener("click", (ev) => {
            ev.stopPropagation();
            callbacksRef.current.onAgentClick?.(agent, category);
          });
          group.appendChild(node);
          prev = pos;
        });
      });

      const rootNode = document.createElementNS(svgNS, "g");
      rootNode.setAttribute("class", "brain-root");
      rootNode.innerHTML = `
        <circle cx="${root.x}" cy="${root.y}" r="48" fill="${color}" fill-opacity="0.12"/>
        <circle cx="${root.x}" cy="${root.y}" r="32" fill="none" stroke="${color}" stroke-opacity="0.9" stroke-width="1.8"/>
        <circle cx="${root.x}" cy="${root.y}" r="22" fill="${color}"/>
        <path d="${iconPath(meta.icon)}" transform="translate(${root.x} ${root.y}) scale(1.7)" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      rootNode.style.cursor = "pointer";
      rootNode.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setOpenNeuron(false);
      });
      group.appendChild(rootNode);

      const label = document.createElementNS(svgNS, "g");
      label.innerHTML = `
        <text x="${root.x}" y="${root.y + 86}" text-anchor="middle" class="brain-focus-title">${CATEGORY_LABELS[category]}</text>
        <text x="${root.x}" y="${root.y + 110}" text-anchor="middle" class="brain-focus-sub">${agentCount} agentes · enter para cerrar</text>
      `;
      group.appendChild(label);

      world.appendChild(group);
    } else {
      // ============ CATEGORÍA ABIERTA — carousel del reel (seg. 5-15) ============
      const category = CATEGORIES[view];
      const color = CATEGORY_COLORS[category];
      const meta = CATEGORY_META[category];
      const agents = CATEGORY_AGENTS[category] || [];
      // Centro visual del bloque en el área útil (bajo topbar, sobre el carousel)
      const root = { x: CX, y: CY + 35 };

      const branch = document.createElementNS(svgNS, "g");
      branch.setAttribute("class", "brain-branch brain-neuron--on");
      branch.dataset.category = category;

      const rootNode = document.createElementNS(svgNS, "g");
      rootNode.setAttribute("class", "brain-root");
      rootNode.innerHTML = `
        <circle cx="${root.x}" cy="${root.y}" r="46" fill="${color}" fill-opacity="0.12"/>
        <circle cx="${root.x}" cy="${root.y}" r="30" fill="none" stroke="${color}" stroke-opacity="0.85" stroke-width="1.6"/>
        <circle cx="${root.x}" cy="${root.y}" r="21" fill="${color}"/>
        <path d="${iconPath(meta.icon)}" transform="translate(${root.x} ${root.y}) scale(1.7)" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      // Enter o clic en la raíz → se abre la neurona y muestra sus agentes
      rootNode.style.cursor = "pointer";
      rootNode.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setOpenNeuron(true);
      });
      branch.appendChild(rootNode);

      const label = document.createElementNS(svgNS, "g");
      label.innerHTML = `
        <text x="${root.x}" y="${root.y + 84}" text-anchor="middle" class="brain-focus-title">${CATEGORY_LABELS[category]}</text>
        <text x="${root.x}" y="${root.y + 108}" text-anchor="middle" class="brain-focus-sub">${agents.length} agente${agents.length === 1 ? "" : "s"} · enter para abrir</text>
      `;
      branch.appendChild(label);

      layoutAgentFan(branch, root, agents, color, view * 97 + 11, callbacksRef, category);
      world.appendChild(branch);

      // Vecinas: silueta mínima (sin growTree) — baratas de montar
      [-1, 1].forEach((dir) => {
        const idx = (view + dir + CATEGORIES.length) % CATEGORIES.length;
        const nCat = CATEGORIES[idx];
        const nx = CX + dir * 620;
        const ny = root.y;
        const g = document.createElementNS(svgNS, "g");
        g.setAttribute("class", "brain-neighbor brain-neighbor--off");
        g.style.cursor = "pointer";
        g.innerHTML = `
          <line x1="${nx}" y1="${ny - 18}" x2="${nx - 40}" y2="${ny - 70}" stroke="rgba(160,170,190,0.32)" stroke-width="1" stroke-linecap="round"/>
          <line x1="${nx - 40}" y1="${ny - 70}" x2="${nx - 52}" y2="${ny - 118}" stroke="rgba(160,170,190,0.28)" stroke-width="1" stroke-linecap="round"/>
          <line x1="${nx}" y1="${ny - 18}" x2="${nx}" y2="${ny - 120}" stroke="rgba(160,170,190,0.32)" stroke-width="1" stroke-linecap="round"/>
          <line x1="${nx}" y1="${ny - 18}" x2="${nx + 40}" y2="${ny - 70}" stroke="rgba(160,170,190,0.32)" stroke-width="1" stroke-linecap="round"/>
          <line x1="${nx + 40}" y1="${ny - 70}" x2="${nx + 52}" y2="${ny - 118}" stroke="rgba(160,170,190,0.28)" stroke-width="1" stroke-linecap="round"/>
          <circle cx="${nx - 52}" cy="${ny - 118}" r="1.6" fill="#9AA3B5" fill-opacity="0.3"/>
          <circle cx="${nx}" cy="${ny - 120}" r="1.6" fill="#9AA3B5" fill-opacity="0.3"/>
          <circle cx="${nx + 52}" cy="${ny - 118}" r="1.6" fill="#9AA3B5" fill-opacity="0.3"/>
          <circle cx="${nx}" cy="${ny}" r="16" fill="rgba(80,88,105,0.45)" stroke="rgba(180,190,210,0.25)" stroke-width="1.2"/>
          <circle cx="${nx}" cy="${ny}" r="11" fill="rgba(55,60,72,0.9)"/>
          <path d="${iconPath(CATEGORY_META[nCat].icon)}" transform="translate(${nx} ${ny})" fill="none" stroke="rgba(200,210,225,0.45)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="${nx}" y="${ny + 42}" text-anchor="middle" class="brain-neighbor-name">${CATEGORY_LABELS[nCat]}</text>
        `;
        g.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setView(idx);
        });
        world.appendChild(g);
      });
    }

    viewport.appendChild(svg);

    // Cámara: sin tween al pasar de neurona (el rebuild ya es el cambio visual)
    const scaleFor = view === "map" ? 0.68 : openNeuron ? 0.88 : 0.86;
    if (viewChanged && !switchingNeuron) {
      stateRef.current = { x: 0, y: 0, scale: scaleFor };
      viewport.classList.add("is-tween");
      window.setTimeout(() => viewport.classList.remove("is-tween"), 320);
    } else if (switchingNeuron) {
      stateRef.current = { x: 0, y: 0, scale: scaleFor };
    }
    const { x, y, scale } = stateRef.current;
    viewport.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;

    if (playPaths || playFlight) {
      requestAnimationFrame(() => {
        if (playPaths) {
          drawables.forEach(({ el, len, delay, dur }) => {
            el.style.strokeDasharray = String(len);
            el.style.strokeDashoffset = String(len);
            el.style.animation = `brain-draw ${dur || 0.22}s linear ${delay}s forwards`;
          });
        }
        if (playFlight) {
          requestAnimationFrame(() => {
            svg.querySelectorAll(".brain-flight").forEach((b) => {
              b.style.transform = "translate(0px, 0px) rotate(0deg)";
            });
          });
        }
      });
      introDoneRef.current = true;
    } else if (viewChanged) {
      introDoneRef.current = true;
    }
  }, [clientName, entries, view, openNeuron]);

  return (
    <div className={`brain-shell${view === "map" ? " brain-shell--map" : ""}`} ref={shellRef}>
      {error ? (
        <div className="brain-error glass">
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            reintentar
          </button>
        </div>
      ) : null}

      <div className="brain-viewport-wrap">
        <div className="brain-viewport" ref={viewportRef} />
      </div>

      {typeof view === "number" ? (
        <div className="brain-carousel glass">
          <button
            type="button"
            className="btn"
            aria-label="Categoría anterior"
            onClick={() => {
              setOpenNeuron(false);
              setView((v) => (v + CATEGORIES.length - 1) % CATEGORIES.length);
            }}
          >
            ‹
          </button>
          {openNeuron ? (
            <button
              type="button"
              className="btn brain-carousel__map"
              onClick={() => setOpenNeuron(false)}
            >
              cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn brain-carousel__map"
                onClick={() => setOpenNeuron(true)}
              >
                abrir
              </button>
              <button
                type="button"
                className="btn brain-carousel__map"
                onClick={() => setView("map")}
              >
                anillo
              </button>
            </>
          )}
          <button
            type="button"
            className="btn"
            aria-label="Categoría siguiente"
            onClick={() => {
              setOpenNeuron(false);
              setView((v) => (v + 1) % CATEGORIES.length);
            }}
          >
            ›
          </button>
        </div>
      ) : (
        <div className="brain-carousel glass">
          <button
            type="button"
            className="btn brain-carousel__map"
            onClick={() => setView(lastFocusRef.current)}
          >
            neuronas
          </button>
        </div>
      )}

      <div className="brain-zoom glass">
        <button type="button" className="btn" data-zoom="out" aria-label="Alejar">
          −
        </button>
        <button type="button" className="btn" data-zoom="reset" aria-label="Reset">
          1:1
        </button>
        <button type="button" className="btn" data-zoom="in" aria-label="Acercar">
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Núcleo tipo grafo denso (referencia): nodos de colores suaves + hilos finos.
 * Estático, sin filtros ni animación — solo círculos y líneas.
 */
function buildBrainCore(parent, seedBase) {
  const svgNS = "http://www.w3.org/2000/svg";
  const nodes = [];
  const N = 96;
  const R = 105;

  // Nube densa al centro (distribución radial sesgada al origen)
  for (let i = 0; i < N; i++) {
    const a = seeded(seedBase + i * 3.1) * Math.PI * 2;
    const rr = Math.pow(seeded(seedBase + i * 5.7), 0.58) * R;
    const x = Math.cos(a) * rr * (0.92 + seeded(seedBase + i) * 0.16);
    const y = Math.sin(a) * rr * (0.88 + seeded(seedBase + i + 2) * 0.18);
    const hub = seeded(seedBase + i + 9) > 0.9;
    nodes.push({
      x,
      y,
      r: hub ? 3 + seeded(seedBase + i + 1) * 1.6 : 0.85 + seeded(seedBase + i + 1) * 1.7,
      c: CORE_COLORS[Math.floor(seeded(seedBase + i + 4) * CORE_COLORS.length)],
      op: hub ? 0.98 : 0.55 + seeded(seedBase + i + 6) * 0.4,
    });
  }

  // Hebras cortas del núcleo (menos ruido hacia las raíces)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + seeded(seedBase + i + 40) * 0.25;
    const steps = 2;
    let px = Math.cos(a) * (R * 0.45);
    let py = Math.sin(a) * (R * 0.45);
    for (let s = 0; s < steps; s++) {
      const jitter = (seeded(seedBase + i * 11 + s) - 0.5) * 12;
      const nx = Math.cos(a) * (R * 0.55 + s * 22) + Math.cos(a + 1.2) * jitter;
      const ny = Math.sin(a) * (R * 0.55 + s * 22) + Math.sin(a + 1.2) * jitter;
      nodes.push({
        x: nx,
        y: ny,
        r: 0.65 + seeded(seedBase + i + s) * 1.0,
        c: CORE_COLORS[Math.floor(seeded(seedBase + i + s + 3) * CORE_COLORS.length)],
        op: 0.28 + seeded(seedBase + i + s + 5) * 0.3,
        rayFrom: { x: px, y: py },
      });
      px = nx;
      py = ny;
    }
  }

  const edges = document.createElementNS(svgNS, "g");
  edges.setAttribute("class", "brain-core__edges");

  // Conectar cada nodo a 2 vecinos cercanos (O(n²) ok con ~120 nodos)
  const coreOnly = nodes.filter((n) => !n.rayFrom);
  for (let i = 0; i < coreOnly.length; i++) {
    const a = coreOnly[i];
    let best = [];
    for (let j = 0; j < coreOnly.length; j++) {
      if (i === j) continue;
      const b = coreOnly[j];
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d > 1400) continue; // ~37px
      best.push({ j, d });
    }
    best.sort((u, v) => u.d - v.d);
    const k = 2 + (seeded(seedBase + i + 80) > 0.55 ? 1 : 0);
    for (let t = 0; t < Math.min(k, best.length); t++) {
      if (best[t].j < i) continue; // evitar aristas duplicadas
      const b = coreOnly[best[t].j];
      const ln = document.createElementNS(svgNS, "line");
      ln.setAttribute("x1", String(a.x));
      ln.setAttribute("y1", String(a.y));
      ln.setAttribute("x2", String(b.x));
      ln.setAttribute("y2", String(b.y));
      ln.setAttribute("stroke", "rgba(220,225,235,0.18)");
      ln.setAttribute("stroke-width", "0.55");
      edges.appendChild(ln);
    }
  }

  // Aristas de las hebras radiantes
  nodes.forEach((n) => {
    if (!n.rayFrom) return;
    const ln = document.createElementNS(svgNS, "line");
    ln.setAttribute("x1", String(n.rayFrom.x));
    ln.setAttribute("y1", String(n.rayFrom.y));
    ln.setAttribute("x2", String(n.x));
    ln.setAttribute("y2", String(n.y));
    ln.setAttribute("stroke", "rgba(220,225,235,0.12)");
    ln.setAttribute("stroke-width", "0.5");
    edges.appendChild(ln);
  });
  parent.appendChild(edges);

  const dots = document.createElementNS(svgNS, "g");
  dots.setAttribute("class", "brain-core__nodes");
  // Centro brillante (ancla)
  const center = document.createElementNS(svgNS, "circle");
  center.setAttribute("cx", "0");
  center.setAttribute("cy", "0");
  center.setAttribute("r", "4.2");
  center.setAttribute("fill", "#FFFFFF");
  center.setAttribute("fill-opacity", "0.98");
  dots.appendChild(center);

  nodes.forEach((n) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", String(n.x));
    c.setAttribute("cy", String(n.y));
    c.setAttribute("r", String(n.r));
    c.setAttribute("fill", n.c);
    c.setAttribute("fill-opacity", String(n.op));
    dots.appendChild(c);
  });
  parent.appendChild(dots);
}

function drawLine(parent, a, b, color, width, delay, dur) {
  const svgNS = "http://www.w3.org/2000/svg";
  const len = lineLen(a, b);
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", String(a.x));
  line.setAttribute("y1", String(a.y));
  line.setAttribute("x2", String(b.x));
  line.setAttribute("y2", String(b.y));
  line.setAttribute("stroke", color || "rgba(255,255,255,0.45)");
  line.setAttribute("stroke-width", String(width || 1.15));
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("class", "brain-draw-line");
  // Si se va a animar, arranca invisible (evita flash del trazo completo)
  if ((delay || 0) > 0 || dur != null) {
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
  }
  parent.appendChild(line);
  return { el: line, len, delay: delay || 0, dur: dur || 0.55 };
}

/** Path orgánico (curvas suaves) — forma tipo dendrita biológica */
function drawCurvePath(parent, points, color, width) {
  const svgNS = "http://www.w3.org/2000/svg";
  if (!points || points.length < 2) return null;
  const path = document.createElementNS(svgNS, "path");
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!next) {
      d += ` L ${cur.x.toFixed(2)} ${cur.y.toFixed(2)}`;
    } else {
      const c1x = prev.x + (cur.x - prev.x) * 0.55;
      const c1y = prev.y + (cur.y - prev.y) * 0.55;
      d += ` Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${cur.x.toFixed(2)} ${cur.y.toFixed(2)}`;
    }
  }
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color || "rgba(255,255,255,0.85)");
  path.setAttribute("stroke-width", String(width || 1.4));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  parent.appendChild(path);
  return { el: path, len: 0, delay: 0, dur: 0 };
}

function drawDashed(parent, a, b, color, dash = "3 4", playIntro = false, delay = 0, width = 1.05) {
  const svgNS = "http://www.w3.org/2000/svg";
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", String(a.x));
  line.setAttribute("y1", String(a.y));
  line.setAttribute("x2", String(b.x));
  line.setAttribute("y2", String(b.y));
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", String(width));
  line.setAttribute("stroke-dasharray", dash);
  line.setAttribute("stroke-linecap", "round");
  if (playIntro) {
    line.setAttribute("class", "brain-reveal");
    line.style.setProperty("--delay", `${delay}s`);
  }
  parent.appendChild(line);
}

function drawDot(parent, p, r, color, opacity) {
  const svgNS = "http://www.w3.org/2000/svg";
  const c = document.createElementNS(svgNS, "circle");
  c.setAttribute("cx", String(p.x));
  c.setAttribute("cy", String(p.y));
  c.setAttribute("r", String(r));
  c.setAttribute("fill", color);
  c.setAttribute("fill-opacity", String(opacity));
  parent.appendChild(c);
  return c;
}

/**
 * Grow a fractal radial tree outward (reel geometry):
 * dense forks, asymmetric lengths, occasional zigzag spines.
 */
function growTree(from, heading, length, depth, maxDepth, seedKey, segments, tips, opts = {}) {
  if (depth >= maxDepth || length < 12) {
    tips.push({ ...from, heading });
    return;
  }

  let forks;
  if (depth === 0) forks = opts.forks0 || 5;
  else if (opts.sparse)
    // Modo ralo: cada dendrita es una polilínea con alguna bifurcación ocasional
    forks = seeded(seedKey + depth * 3) > 0.72 ? 2 : 1;
  else if (depth === 1) forks = seeded(seedKey + depth * 3) > 0.3 ? 3 : 2;
  else if (depth === 2) forks = seeded(seedKey + depth * 5) > 0.45 ? 2 : 1;
  else forks = seeded(seedKey + depth * 7) > 0.6 ? 2 : 1;

  const spread =
    depth === 0 ? opts.spread0 || 52 : depth === 1 ? 34 : depth === 2 ? 22 : 16;

  for (let i = 0; i < forks; i++) {
    const t = forks === 1 ? 0.5 : i / (forks - 1);
    const jitter = (seeded(seedKey + i * 19 + depth) - 0.5) * 12;
    const ang = heading - spread / 2 + spread * t + jitter;
    const len = length * (0.68 + seeded(seedKey + i * 7) * 0.28);
    const to = polar(from.x, from.y, len, ang);

    // Occasional zigzag like the marketing spine in the reel
    if (depth === 1 && seeded(seedKey + i * 41) > 0.78) {
      pushZigzag(segments, from, to, ang, depth, seedKey + i);
    } else {
      segments.push({ a: from, b: to, depth });
    }

    growTree(to, ang, len * 0.9, depth + 1, maxDepth, seedKey + i * 31 + 3, segments, tips, opts);
  }
}

function pushZigzag(segments, from, to, heading, depth, seedKey) {
  const steps = 3;
  let prev = from;
  const total = Math.hypot(to.x - from.x, to.y - from.y);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const along = polar(from.x, from.y, total * t, heading);
    const side = (s % 2 === 0 ? 1 : -1) * (7 + seeded(seedKey + s) * 6);
    const pt =
      s === steps
        ? to
        : {
            x: along.x + Math.cos(degToRad(heading + 90)) * side,
            y: along.y + Math.sin(degToRad(heading + 90)) * side,
          };
    segments.push({ a: prev, b: pt, depth });
    prev = pt;
  }
}

/**
 * Polvo suave núcleo → neurona (pelotitas con drift, sin línea dura).
 */
function drawStemDust(parent, cx, cy, root, color, seedKey, playIntro, delay) {
  const svgNS = "http://www.w3.org/2000/svg";
  const ang = Math.atan2(root.y - cy, root.x - cx);
  const startR = 78;
  const endR = R1 - 34;
  const n = 5; // escaso, como el reel (aire entre núcleo y neurona)
  const group = document.createElementNS(svgNS, "g");
  group.setAttribute("class", playIntro ? "brain-stem-dust brain-reveal" : "brain-stem-dust");
  if (playIntro) group.style.setProperty("--delay", `${delay}s`);

  for (let i = 0; i < n; i++) {
    const t = (i + 0.4) / n;
    const rr = startR + (endR - startR) * t;
    const side = (seeded(seedKey + i * 7) - 0.5) * 10;
    const x = cx + Math.cos(ang) * rr + Math.cos(ang + Math.PI / 2) * side;
    const y = cy + Math.sin(ang) * rr + Math.sin(ang + Math.PI / 2) * side;
    const r = 0.85 + seeded(seedKey + i + 3) * 1.35;
    const useAccent = seeded(seedKey + i + 9) > 0.72;
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", useAccent ? color : "#FFFFFF");
    c.setAttribute("fill-opacity", String(0.22 + seeded(seedKey + i + 2) * 0.35));
    c.setAttribute("class", "brain-stem-dot");
    c.style.setProperty("--dx", `${(seeded(seedKey + i * 3) - 0.5) * 5}px`);
    c.style.setProperty("--dy", `${(seeded(seedKey + i * 5) - 0.5) * 5}px`);
    c.style.setProperty("--drift", `${3 + seeded(seedKey + i) * 2}s`);
    c.style.animationDelay = `${i * 0.15}s`;
    group.appendChild(c);
  }
  parent.appendChild(group);
}

/**
 * Vista anillo con morfología de neurona: extremidades gruesas que se bifurcan
 * y afinan hacia puntas orgánicas (referencia biológica).
 */
function layoutRingDendrites(
  branch,
  root,
  baseDeg,
  catEntries,
  color,
  seedKey,
  callbacksRef,
  drawables,
  isEmpty,
  ring
) {
  const svgNS = "http://www.w3.org/2000/svg";
  const { cx, cy, rOuter, halfSpan } = ring;
  const span = halfSpan - 1;
  const tips = [];
  const STROKE = "rgba(255,255,255,0.88)";

  // Soma suave alrededor de la raíz (cuerpo de la neurona)
  const soma = document.createElementNS(svgNS, "circle");
  soma.setAttribute("cx", String(root.x));
  soma.setAttribute("cy", String(root.y));
  soma.setAttribute("r", "22");
  soma.setAttribute("fill", color);
  soma.setAttribute("fill-opacity", "0.14");
  branch.insertBefore(soma, branch.firstChild);

  for (let i = 0; i < RING_LIMBS; i++) {
    const t = RING_LIMBS === 1 ? 0.5 : i / (RING_LIMBS - 1);
    const isEdge = i === 0 || i === RING_LIMBS - 1;
    const tipAng = isEdge
      ? baseDeg + (i === 0 ? -halfSpan : halfSpan)
      : baseDeg - span + span * 2 * t + (seeded(seedKey + i * 3) - 0.5) * 4;
    const tipR = isEdge
      ? rOuter
      : rOuter * (0.82 + seeded(seedKey + i * 11) * 0.22);

    // Camino ondulado raíz → punta (3–4 vértices con offset perpendicular)
    const pathPts = buildOrganicLimb(root, cx, cy, tipAng, tipR, seedKey + i * 41, 4);
    const tip = pathPts[pathPts.length - 1];
    const forkAt = pathPts[Math.floor(pathPts.length * 0.45)];

    // Grosor: grueso en la base, fino en la punta (dos trazos)
    drawables.push(drawCurvePath(branch, pathPts.slice(0, 3), STROKE, 2.6));
    drawables.push(drawCurvePath(branch, pathPts.slice(1), STROKE, 1.35));
    pathPts.forEach((p, pi) => {
      if (pi === 0) return;
      drawDot(branch, p, pi === pathPts.length - 1 ? 2.2 : 1.6, "#FFFFFF", 0.9);
    });
    tips.push({ ...tip, heading: tipAng, ang: tipAng, r: tipR });

    // Bifurcación (casi siempre, como la referencia)
    const sides = isEdge ? [i === 0 ? -1 : 1] : [-1, 1];
    sides.forEach((side, fi) => {
      if (!isEdge && fi === 1 && seeded(seedKey + i * 19) < 0.28) return;
      const fAng = tipAng + side * (12 + seeded(seedKey + i * 17 + fi) * 14);
      const fTipR = tipR * (0.55 + seeded(seedKey + i * 23 + fi) * 0.28);
      const forkPts = buildOrganicLimb(forkAt, cx, cy, fAng, fTipR, seedKey + i * 59 + fi, 3);
      drawables.push(drawCurvePath(branch, forkPts, STROKE, 1.15));
      const fTip = forkPts[forkPts.length - 1];
      forkPts.slice(1).forEach((p, pi) => {
        drawDot(branch, p, pi === forkPts.length - 2 ? 1.9 : 1.35, "#FFFFFF", 0.85);
      });
      tips.push({ ...fTip, heading: fAng, ang: fAng, r: fTipR });

      // Espina / ramita corta ocasional
      if (seeded(seedKey + i * 29 + fi) > 0.55) {
        const thornFrom = forkPts[1] || forkAt;
        const thornAng = fAng + side * (18 + seeded(seedKey + i + fi) * 10);
        const thorn = polar(thornFrom.x, thornFrom.y, 22 + seeded(seedKey + i * 31) * 16, thornAng);
        drawables.push(drawCurvePath(branch, [thornFrom, thorn], STROKE, 0.95));
        drawDot(branch, thorn, 1.4, "#FFFFFF", 0.8);
        tips.push({ ...thorn, heading: thornAng, ang: thornAng, r: Math.hypot(thorn.x - cx, thorn.y - cy) });
      }
    });
  }

  // Unir solo las puntas de borde con la vecina (comparten ángulo ±halfSpan)
  // — sin tejido que forme un círculo.

  if (isEmpty) {
    const tip = tips[Math.floor(tips.length / 2)] || polar(cx, cy, rOuter, baseDeg);
    const ghost = document.createElementNS(svgNS, "g");
    ghost.setAttribute("class", "brain-ghost");
    ghost.style.cursor = "pointer";
    ghost.innerHTML = `
      <circle cx="${tip.x}" cy="${tip.y}" r="12" fill="transparent"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="6.5" fill="none" stroke="${color}" stroke-opacity="0.85" stroke-width="1.5" stroke-dasharray="2.5 3"/>
    `;
    ghost.addEventListener("click", (ev) => {
      ev.stopPropagation();
      callbacksRef.current.onGhostClick?.(branch.dataset.category);
    });
    branch.appendChild(ghost);
    return;
  }

  const stride = Math.max(1, Math.floor(tips.length / Math.max(catEntries.length, 1)));
  catEntries.forEach((entry, idx) => {
    const tip = tips[(idx * stride) % tips.length];
    const leaf = document.createElementNS(svgNS, "g");
    leaf.setAttribute("class", `brain-leaf brain-leaf--${entry.status}`);
    leaf.style.cursor = "pointer";
    leaf.dataset.id = entry.id;
    const accent =
      entry.status === "error" ? "#FF8A7A" : entry.status === "processing" ? color : "#FFFFFF";
    leaf.innerHTML = `
      <circle cx="${tip.x}" cy="${tip.y}" r="12" fill="transparent"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="3.6" fill="${accent}"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="1.6" fill="${color}"/>
      <title>${escapeXml(entry.title)}</title>
    `;
    leaf.addEventListener("click", (ev) => {
      ev.stopPropagation();
      callbacksRef.current.onLeafClick?.(entry);
    });
    branch.appendChild(leaf);
  });
}

/** Genera puntos de una extremidad ondulada desde `from` hacia (ang, rTip). */
function buildOrganicLimb(from, cx, cy, tipAng, tipR, seedKey, steps = 4) {
  const tip = polar(cx, cy, tipR, tipAng);
  const pts = [from];
  for (let s = 1; s < steps; s++) {
    const u = s / steps;
    // Interpolación + onda perpendicular (forma viva, no geométrica)
    const along = {
      x: from.x + (tip.x - from.x) * u,
      y: from.y + (tip.y - from.y) * u,
    };
    const heading = Math.atan2(tip.y - from.y, tip.x - from.x);
    const amp = (1 - Math.abs(u - 0.5) * 1.2) * (14 + seeded(seedKey + s) * 16);
    const wave = Math.sin(u * Math.PI * (1.2 + seeded(seedKey + 2) * 0.8) + seeded(seedKey) * 4);
    const side = (seeded(seedKey + s * 3) > 0.5 ? 1 : -1);
    pts.push({
      x: along.x + Math.cos(heading + Math.PI / 2) * amp * wave * side * 0.55,
      y: along.y + Math.sin(heading + Math.PI / 2) * amp * wave * side * 0.55,
    });
  }
  pts.push(tip);
  return pts;
}

function layoutRadialTree(
  branch,
  root,
  baseDeg,
  catEntries,
  color,
  seedKey,
  callbacksRef,
  drawables,
  playIntro,
  startDelay,
  isEmpty,
  opts = {}
) {
  const svgNS = "http://www.w3.org/2000/svg";
  const segments = [];
  const tips = [];

  const len0 = opts.len0 ?? TREE_LEN0;
  const depthMax = opts.depth ?? TREE_DEPTH;
  const trunk = opts.trunk ?? 40;
  const k = opts.leafScale ?? 1;

  // Longer trunk then dense fractal fan — reel silhouette (vista neurona)
  const trunkEnd = polar(root.x, root.y, trunk, baseDeg);
  segments.push({ a: root, b: trunkEnd, depth: 0 });
  growTree(trunkEnd, baseDeg, len0, 0, depthMax, seedKey, segments, tips, opts);

  segments.forEach((seg, idx) => {
    const delay = playIntro ? startDelay + seg.depth * 0.08 + (idx % 5) * 0.01 : 0;
    drawables.push(
      drawLine(branch, seg.a, seg.b, "rgba(255,255,255,0.55)", 1.05, delay)
    );
    // Junction dots (skip root)
    if (seg.depth >= 0 && (seg.a.x !== root.x || seg.a.y !== root.y)) {
      drawDot(branch, seg.a, 1.6, "#FFFFFF", 0.55);
    }
    drawDot(branch, seg.b, seg.depth >= depthMax - 1 ? 2.4 : 1.7, "#FFFFFF", 0.75);
  });

  // Puntos de color en la base de cada rama principal (detalle del reel en vista abierta)
  if (opts.baseDots) {
    segments
      .filter((s) => s.depth === 0 && (s.a.x !== root.x || s.a.y !== root.y))
      .forEach((s) => {
        const p = {
          x: s.a.x + (s.b.x - s.a.x) * 0.22,
          y: s.a.y + (s.b.y - s.a.y) * 0.22,
        };
        drawDot(branch, p, 2.4, color, 0.95);
      });
  }

  // Assign real entries to tips; rest stay decorative white dots
  const tipSlots = tips.length ? tips : [{ ...polar(root.x, root.y, len0 * 1.6, baseDeg), heading: baseDeg }];

  if (isEmpty) {
    const tip = tipSlots[Math.floor(tipSlots.length / 2)];
    const ghost = document.createElementNS(svgNS, "g");
    ghost.setAttribute("class", "brain-ghost");
    ghost.style.cursor = "pointer";
    ghost.innerHTML = `
      <circle cx="${tip.x}" cy="${tip.y}" r="${14 * k}" fill="transparent"/>
      <circle cx="${tip.x}" cy="${tip.y}" r="${7 * k}" fill="none" stroke="${color}" stroke-opacity="0.8" stroke-width="1.4" stroke-dasharray="2.5 3"/>
      <text x="${tip.x}" y="${tip.y + 22 * k}" text-anchor="middle" class="brain-ghost-label" fill="${color}">sin contenido — cargar</text>
    `;
    ghost.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // category from branch dataset
      const cat = branch.dataset.category;
      callbacksRef.current.onGhostClick?.(cat);
    });
    branch.appendChild(ghost);
    return;
  }

  // Repartir las entries a lo ancho del abanico (no en puntas adyacentes)
  const stride = Math.max(1, Math.floor(tipSlots.length / Math.max(catEntries.length, 1)));

  catEntries.forEach((entry, idx) => {
    const tip = tipSlots[(idx * stride) % tipSlots.length];
    // Slight offset if multiple entries share a tip
    const share = Math.floor(idx / tipSlots.length);
    const pos =
      share === 0
        ? tip
        : polar(tip.x, tip.y, 16 + share * 12, tip.heading + (share % 2 === 0 ? 18 : -18));

    if (share > 0) {
      drawables.push(
        drawLine(branch, tip, pos, "rgba(255,255,255,0.4)", 0.95, playIntro ? startDelay + 0.35 : 0)
      );
    }

    const leaf = document.createElementNS(svgNS, "g");
    leaf.setAttribute(
      "class",
      playIntro
        ? `brain-leaf brain-leaf--${entry.status} brain-reveal`
        : `brain-leaf brain-leaf--${entry.status}`
    );
    leaf.style.cursor = "pointer";
    if (playIntro) leaf.style.setProperty("--delay", `${startDelay + 0.35 + idx * 0.04}s`);
    leaf.dataset.id = entry.id;

    let visual = "";
    if (entry.status === "processing") {
      visual = `
        <circle cx="${pos.x}" cy="${pos.y}" r="${8 * k}" fill="none" stroke="${color}" stroke-width="1.4" stroke-dasharray="3 3" class="brain-spin" style="transform-origin:${pos.x}px ${pos.y}px"/>
        <circle cx="${pos.x}" cy="${pos.y}" r="${3.2 * k}" fill="${color}"/>`;
    } else if (entry.status === "error") {
      visual = `
        <circle cx="${pos.x}" cy="${pos.y}" r="${6.5 * k}" fill="none" stroke="#FF8A7A" stroke-width="1.5"/>
        <circle cx="${pos.x}" cy="${pos.y}" r="${3.2 * k}" fill="#FF8A7A"/>`;
    } else {
      visual = `
        <circle cx="${pos.x}" cy="${pos.y}" r="${4.2 * k}" fill="#FFFFFF"/>
        <circle cx="${pos.x}" cy="${pos.y}" r="${2 * k}" fill="${color}"/>`;
    }

    const maxTitle = opts.labelsOn ? 26 : 18;
    leaf.innerHTML = `
      <circle cx="${pos.x}" cy="${pos.y}" r="${12 * k}" fill="transparent"/>
      ${visual}
      <title>${escapeXml(entry.title)}</title>
      <text x="${pos.x}" y="${pos.y + 16 * k}" text-anchor="middle" class="brain-leaf-label${
        opts.labelsOn ? " brain-leaf-label--on" : ""
      }">${escapeXml(
        entry.title.length > maxTitle ? `${entry.title.slice(0, maxTitle - 1)}…` : entry.title
      )}</text>
    `;
    leaf.addEventListener("click", (ev) => {
      ev.stopPropagation();
      callbacksRef.current.onLeafClick?.(entry);
    });
    branch.appendChild(leaf);
  });
}
