import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getApifyStatus, getClaudeStatus, saveApifyKey, saveClaudeKey } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ConnectionsPage() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Apify solo se usa para leer perfiles de Instagram de referencia.
  const [apifyKey, setApifyKey] = useState("");
  const [apifyStatus, setApifyStatus] = useState(null);
  const [apifySaving, setApifySaving] = useState(false);

  const guardarApify = async () => {
    setApifySaving(true);
    setError("");
    try {
      setApifyStatus(await saveApifyKey(apifyKey));
      setApifyKey("");
    } catch (e) {
      setError(e?.message || "No se pudo guardar la key de Apify.");
    } finally {
      setApifySaving(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError("");
    // Antes esto solo preguntaba por Claude: el estado de Apify quedaba en
    // null al entrar y la pantalla decía "Sin conectar" aunque el token
    // estuviera guardado. Solo se veía bien justo después de guardarlo.
    Promise.all([
      getClaudeStatus().catch(() => null),
      getApifyStatus().catch(() => null),
    ])
      .then(([claude, apify]) => {
        setStatus(claude);
        setApifyStatus(apify);
        if (!claude) setError("No se pudo leer el estado. ¿Está corriendo el backend?");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const next = await saveClaudeKey(apiKey);
      setStatus(next);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("No se pudo guardar la key. Revisá que empiece con sk-ant- y que uvicorn esté en 8000.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-white/8 px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Conexión</p>
          <h1 className="mt-1 text-lg font-semibold text-white">Claude</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Pegá acá la API key de Anthropic. Los agentes la usan para correr (modelo {status?.model || "claude-haiku-4-5"}).
          </p>
        </div>

        {loading ? (
          <div className="page-center">
            <p className="text-sm text-white/35">Cargando conexión…</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mx-auto flex max-w-xl flex-col gap-5">
              <div className="rounded-xl border border-white/10 bg-[#111] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Estado</p>
                <p className="mt-1 text-sm text-white">
                  {status?.connected
                    ? `Conectado · ${status.hint}${status.source === "env" ? " (desde .env)" : ""}`
                    : "Sin conectar"}
                </p>
              </div>

              {error ? <p className="text-sm text-red-400">{error}</p> : null}

              <label className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c0e] px-3 font-mono text-sm text-white outline-none focus:border-primary/50"
                />
              </label>

              <p className="text-xs leading-relaxed text-white/35">
                La creás en{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/70 underline underline-offset-2"
                >
                  console.anthropic.com/settings/keys
                </a>
                . Se guarda en la base de Grounded; no hace falta tocar el .env.
              </p>

              <div>
                <Button onClick={handleSave} disabled={saving || !apiKey.trim()}>
                  {saving ? "Conectando…" : saved ? "Conectado" : "Conectar Claude"}
                </Button>
              </div>

              <div className="mt-4 border-t border-white/8 pt-6">
                <h2 className="text-base font-semibold text-white">Apify</h2>
                <p className="mt-1 text-sm text-white/45">
                  Opcional. Solo hace falta para que los agentes puedan leer perfiles de
                  Instagram que les pases por enlace. Los videos de YouTube ya se leen sin
                  esto.
                </p>

                <div className="mt-4 rounded-xl border border-white/10 bg-[#111] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Estado</p>
                  <p className="mt-1 text-sm text-white">
                    {apifyStatus?.connected
                      ? `Conectado · ${apifyStatus.hint}${apifyStatus.source === "env" ? " (desde .env)" : ""}`
                      : "Sin conectar — se pueden subir capturas a mano igual"}
                  </p>
                </div>

                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">API token</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={apifyKey}
                    onChange={(e) => setApifyKey(e.target.value)}
                    placeholder="apify_api_…"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c0e] px-3 font-mono text-sm text-white outline-none focus:border-primary/50"
                  />
                </label>

                <p className="mt-3 text-xs leading-relaxed text-white/35">
                  Lo sacás en{" "}
                  <a
                    href="https://console.apify.com/settings/integrations"
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/70 underline underline-offset-2"
                  >
                    console.apify.com/settings/integrations
                  </a>
                  . El plan gratuito trae USD 5 de crédito por mes, alcanza para unos 60 perfiles.
                </p>

                <div className="mt-4 pb-8">
                  <Button onClick={guardarApify} disabled={apifySaving || !apifyKey.trim()}>
                    {apifySaving ? "Guardando…" : "Guardar token"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
