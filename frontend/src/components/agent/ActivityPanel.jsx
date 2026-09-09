import { useEffect, useState } from "react";
import { AlertCircle, Check, Link2, Loader2, Paperclip, X } from "lucide-react";
import { formatChars, formatElapsed, shortModel } from "@/lib/agents";
import { cn } from "@/lib/utils";

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function StepDot({ status }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin" />;
  if (status === "done") return <Check className="size-3.5" strokeWidth={3} />;
  if (status === "error") return <X className="size-3.5" strokeWidth={3} />;
  return <span className="ws-step__idle" />;
}

/**
 * Actividad — lo que el agente está leyendo y haciendo, con tiempo real.
 * Los pasos previos a la generación son la tubería conocida del backend
 * (Estilo → prompt → ejemplos → referencias); lo que se mide de verdad es
 * el inicio, el tiempo total, el resultado y su tamaño.
 */
export function ActivityPanel({ trace, runs = [], onClose }) {
  const running = trace.phase === "running";
  const now = useNow(running);
  const elapsed = trace.startedAt
    ? (trace.finishedAt || (running ? now : trace.startedAt)) - trace.startedAt
    : 0;

  return (
    <aside className="ws-activity">
      <header className="ws-activity__head">
        <div>
          <p className="ws-kicker">Actividad</p>
          <p className="ws-activity__state">
            {trace.phase === "idle" && "Esperando el brief"}
            {trace.phase === "running" && (
              <>
                Trabajando <span className="ws-mono">{formatElapsed(elapsed)}</span>
              </>
            )}
            {trace.phase === "done" && (
              <>
                Listo en <span className="ws-mono">{formatElapsed(elapsed)}</span>
              </>
            )}
            {trace.phase === "error" && "Falló"}
          </p>
        </div>
        <button type="button" className="ws-iconbtn" aria-label="Ocultar actividad" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>

      <div className="ws-activity__body">
        {trace.phase === "idle" ? (
          <div className="ws-activity__empty">
            <p>Cuando mandes el brief, acá ves qué lee el agente y cuánto tarda cada parte.</p>
            <dl className="ws-facts">
              <div>
                <dt>Modelo</dt>
                <dd className="ws-mono">{shortModel(trace.model)}</dd>
              </div>
              <div>
                <dt>Ejemplos</dt>
                <dd className="ws-mono">{trace.examples ?? "—"}</dd>
              </div>
              <div>
                <dt>Estilo</dt>
                <dd>global</dd>
              </div>
            </dl>
          </div>
        ) : (
          <ol className="ws-steps">
            {trace.steps.map((s) => (
              <li key={s.key} className={cn("ws-step", `is-${s.status}`)}>
                <span className="ws-step__dot">
                  <StepDot status={s.status} />
                </span>
                <span className="ws-step__copy">
                  <span className="ws-step__label">{s.label}</span>
                  {s.detail ? <span className="ws-step__detail">{s.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}

        {trace.phase === "error" && trace.error ? (
          <div className="ws-alert">
            <AlertCircle className="size-4 shrink-0" />
            <p>{trace.error}</p>
          </div>
        ) : null}

        {trace.sources?.urls?.length || trace.sources?.files?.length ? (
          <section className="ws-sources">
            <p className="ws-kicker">Fuentes leídas</p>
            <ul>
              {(trace.sources.files || []).map((name) => (
                <li key={`f-${name}`}>
                  <Paperclip className="size-3.5" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
              {(trace.sources.urls || []).map((r) => (
                <li key={r.url}>
                  <Link2 className="size-3.5" />
                  <span className="ws-chip">{r.platform}</span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="truncate">
                    {r.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {runs.length ? (
          <section className="ws-runs">
            <p className="ws-kicker">Esta sesión</p>
            <ul>
              {runs.map((r) => (
                <li key={r.id} className={cn(!r.ok && "is-error")}>
                  <span className="ws-runs__kind">{r.kind === "run" ? "Corrida" : "Chat"}</span>
                  <span className="ws-mono">{formatElapsed(r.elapsedMs)}</span>
                  <span className="ws-mono">{r.ok ? `${formatChars(r.chars)} chars` : "error"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
