import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const NODE_W = 220;
const NODE_H = 70;
const GAP_X = 56;
const GAP_Y = 52;
const WORLD_PAD = 18;
const STACK_BREAKPOINT = 720;
const BUBBLE_W = 200;
const BUBBLE_H = 54;
const BUBBLE_GAP = 14;
const DROP = 24;

export const NODE_META = {
  input: { kicker: "Input", icon: FileText, color: "#ea4b71" },
  work: { kicker: "Proceso", icon: Sparkles, color: "#e11d2e" },
  chat: { kicker: "Salida", icon: MessageSquare, color: "#6d7cff" },
};

function subHeight(count) {
  if (count <= 0) return 0;
  return DROP + count * BUBBLE_H + Math.max(0, count - 1) * BUBBLE_GAP;
}

function layout(count, canvasW, canvasH, extraH = 0, workIndex = 1) {
  const stacked = canvasW < STACK_BREAKPOINT;
  const nodeW = stacked ? Math.min(NODE_W, Math.max(168, canvasW - 56)) : NODE_W;
  const graphW = stacked
    ? nodeW
    : count * NODE_W + Math.max(0, count - 1) * GAP_X;
  const graphH = stacked
    ? count * NODE_H + Math.max(0, count - 1) * GAP_Y + extraH
    : NODE_H + extraH;

  const worldW = graphW + WORLD_PAD * 2;
  const worldH = graphH + WORLD_PAD * 2;
  const scale = Math.min(
    1,
    Math.max(0.35, (canvasW - 32) / worldW),
    Math.max(0.35, (canvasH - 96) / worldH)
  );

  const positions = Array.from({ length: count }, (_, i) => {
    if (stacked) {
      let y = WORLD_PAD + i * (NODE_H + GAP_Y);
      if (i > workIndex) y += extraH;
      return { x: WORLD_PAD, y };
    }
    return { x: WORLD_PAD + i * (NODE_W + GAP_X), y: WORLD_PAD };
  });

  return {
    stacked,
    nodeW,
    nodeH: NODE_H,
    worldW,
    worldH,
    scale,
    ox: (canvasW - worldW * scale) / 2,
    oy: (canvasH - worldH * scale) / 2,
    positions,
  };
}

function edgePath(a, b, nodeW, nodeH, stacked) {
  if (stacked) {
    const x1 = a.x + nodeW / 2;
    const y1 = a.y + nodeH;
    const x2 = b.x + nodeW / 2;
    const y2 = b.y;
    const c = Math.max(18, (y2 - y1) * 0.4);
    return `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`;
  }
  const x1 = a.x + nodeW;
  const y1 = a.y + nodeH / 2;
  const x2 = b.x;
  const y2 = b.y + nodeH / 2;
  const c = Math.max(36, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}

function dropPath(from, to, fromW, fromH, toW) {
  const x1 = from.x + fromW / 2;
  const y1 = from.y + fromH;
  const x2 = to.x + toW / 2;
  const y2 = to.y;
  const c = Math.max(10, (y2 - y1) * 0.4);
  return `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`;
}

function subtitle(node) {
  if (node.status === "running") return "Trabajando…";
  if (node.status === "idle") return "Click para abrir";
  if (node.status === "error") return "Error";
  if (node.status === "done" && node.type === "chat") return "Visto";
  if (node.type === "work") return "Listo";
  const t = (node.content || "").replace(/\s+/g, " ").trim();
  return t ? (t.length > 32 ? `${t.slice(0, 32)}…` : t) : "Cargado";
}

function bubbleStatus(processStep, key) {
  if (key === "tone") {
    if (processStep === "tone") return "running";
    if (["prompt", "done", "error"].includes(processStep)) return "done";
  }
  if (key === "prompt") {
    if (processStep === "prompt") return "running";
    if (processStep === "done") return "done";
    if (processStep === "error") return "error";
  }
  return "idle";
}

export function AgentWorkflow({
  nodes,
  selectedId,
  onSelect,
  agentName,
  obscured = false,
  processStep = "idle",
}) {
  const wrapRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 900, h: 420 });
  const drag = useRef(null);
  const workIndex = Math.max(0, nodes.findIndex((n) => n.type === "work"));
  const subCount = processStep === "idle" ? 0 : processStep === "tone" ? 1 : 2;
  const extraH = subHeight(subCount);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(
    () => layout(nodes.length, size.w, size.h, extraH, workIndex),
    [nodes.length, size.w, size.h, extraH, workIndex]
  );

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      setPan({
        x: e.clientX - drag.current.sx,
        y: e.clientY - drag.current.sy,
      });
    };
    const onUp = () => {
      drag.current = null;
      wrapRef.current?.classList.remove("is-panning");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const workPos = geo.positions[workIndex];
  const bubbleW = Math.min(BUBBLE_W, geo.nodeW);
  const bubbles = [];
  if (workPos && subCount > 0) {
    const bx = workPos.x + (geo.nodeW - bubbleW) / 2;
    bubbles.push({
      key: "tone",
      title: "Tono de voz",
      sub: bubbleStatus(processStep, "tone") === "running" ? "Leyendo Estilo…" : "Leído",
      icon: BookOpen,
      color: "#c9a24b",
      x: bx,
      y: workPos.y + geo.nodeH + DROP,
      status: bubbleStatus(processStep, "tone"),
    });
  }
  if (workPos && subCount > 1) {
    const bx = workPos.x + (geo.nodeW - bubbleW) / 2;
    const prev = bubbles[0];
    bubbles.push({
      key: "prompt",
      title: "Prompt del agente",
      sub:
        bubbleStatus(processStep, "prompt") === "running"
          ? "Interpretando Oferta y Escalera…"
          : "Interpretado",
      icon: Sparkles,
      color: "#e11d2e",
      x: bx,
      y: prev.y + BUBBLE_H + BUBBLE_GAP,
      status: bubbleStatus(processStep, "prompt"),
    });
  }

  return (
    <div
      ref={wrapRef}
      className={cn("wf-canvas", obscured && "is-obscured", geo.stacked && "is-stacked")}
      onPointerDown={(e) => {
        if (obscured || e.target.closest(".wf-node, .wf-bubble")) return;
        drag.current = { sx: e.clientX - pan.x, sy: e.clientY - pan.y };
        wrapRef.current?.classList.add("is-panning");
      }}
    >
      <div
        className="wf-world"
        style={{
          width: geo.worldW,
          height: geo.worldH,
          transform: `translate(${geo.ox + pan.x}px, ${geo.oy + pan.y}px) scale(${geo.scale})`,
        }}
      >
        <svg className="wf-edges" width={geo.worldW} height={geo.worldH}>
          {nodes.slice(0, -1).map((n, i) => {
            const d = edgePath(geo.positions[i], geo.positions[i + 1], geo.nodeW, geo.nodeH, geo.stacked);
            const live = nodes[i + 1]?.status === "running" || n.status === "running";
            return (
              <g key={`${n.id}-e`}>
                <path d={d} className={cn("wf-edge", live && "is-live")} />
                {live ? (
                  <circle r="3.5" fill="#ff4d5c">
                    <animateMotion dur="1.15s" repeatCount="indefinite" path={d} />
                  </circle>
                ) : null}
              </g>
            );
          })}
          {bubbles.map((b, i) => {
            const from = i === 0 ? workPos : { x: bubbles[i - 1].x, y: bubbles[i - 1].y };
            const fromW = i === 0 ? geo.nodeW : bubbleW;
            const fromH = i === 0 ? geo.nodeH : BUBBLE_H;
            const d = dropPath(from, b, fromW, fromH, bubbleW);
            return (
              <path
                key={`${b.key}-e`}
                d={d}
                className={cn("wf-edge", b.status === "running" && "is-live")}
              />
            );
          })}
        </svg>

        {nodes.map((node, i) => {
          const pos = geo.positions[i];
          const meta = NODE_META[node.type] || NODE_META.work;
          const Icon = meta.icon;
          const running = node.status === "running";
          const done = node.status === "done";
          return (
            <button
              key={node.id}
              type="button"
              className={cn(
                "wf-node",
                selectedId === node.id && "is-selected",
                running && "is-running",
                done && "is-done"
              )}
              style={{ left: pos.x, top: pos.y, width: geo.nodeW, height: geo.nodeH }}
              onClick={() => onSelect?.(node.id)}
            >
              {i > 0 ? <span className="wf-handle wf-handle--in" /> : null}
              {i < nodes.length - 1 ? <span className="wf-handle wf-handle--out" /> : null}
              <span className="wf-node__icon" style={{ background: meta.color }}>
                {running ? <span className="wf-node__ping" /> : null}
                {running ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                {done ? (
                  <span className="wf-node__seen" aria-hidden="true">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="wf-node__copy">
                <strong className="wf-node__title">
                  {node.title || (node.type === "work" ? agentName : meta.kicker)}
                </strong>
                <p className="wf-node__sub">{subtitle(node)}</p>
              </span>
            </button>
          );
        })}

        {bubbles.map((b) => {
          const Icon = b.icon;
          const running = b.status === "running";
          const done = b.status === "done";
          return (
            <div
              key={b.key}
              className={cn("wf-bubble", running && "is-running", done && "is-done")}
              style={{ left: b.x, top: b.y, width: bubbleW, height: BUBBLE_H }}
            >
              <span className="wf-handle wf-handle--in" />
              <span className="wf-node__icon" style={{ background: b.color }}>
                {running ? <span className="wf-node__ping" /> : null}
                {running ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                {done ? (
                  <span className="wf-node__seen" aria-hidden="true">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="wf-node__copy">
                <strong className="wf-node__title">{b.title}</strong>
                <p className="wf-node__sub">{b.sub}</p>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
