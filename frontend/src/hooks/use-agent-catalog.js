import { useEffect, useState } from "react";
import { getAgentExamples, listAgents } from "@/lib/api";
import { allAgents } from "@/lib/agents";

/**
 * Los 14 agentes con su estado real: si tienen documento y cuántos ejemplos
 * cargan. Arranca con el catálogo estático (para pintar al instante) y se
 * completa con la API. Lo usan el inicio y el plantel.
 */
export function useAgentCatalog() {
  const [agents, setAgents] = useState(() =>
    allAgents().map((a) => ({ ...a, has_prompt: null, examples: null }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listAgents();
        const byId = Object.fromEntries((data?.agents || []).map((a) => [a.id, a]));
        const counts = await Promise.all(
          allAgents().map((a) =>
            getAgentExamples(a.id)
              .then((list) => (Array.isArray(list) ? list.length : 0))
              .catch(() => 0)
          )
        );
        if (!alive) return;
        setAgents(
          allAgents().map((a, i) => ({
            ...a,
            has_prompt: Boolean(byId[a.id]?.has_prompt),
            examples: counts[i],
          }))
        );
      } catch {
        if (alive) setError("No se pudo cargar el catálogo. ¿Está corriendo el backend?");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { agents, loading, error };
}
