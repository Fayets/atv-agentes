import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import BrainCanvas from "@/components/BrainCanvas";
import UploadDrawer from "@/components/UploadDrawer";
import DetailPanel from "@/components/DetailPanel";
import AgentDocView from "@/components/AgentDocView";
import * as api from "@/lib/api";

export default function DashboardPage() {
  const { clientId } = useParams();
  const client = useMemo(() => api.getClientById(clientId), [clientId]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("marketing");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getKbEntries(clientId);
      setEntries(data);
    } catch {
      setError("No se pudo cargar el árbol de conocimiento.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const hasProcessing = entries.some((e) => e.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return undefined;
    const id = setInterval(async () => {
      try {
        const data = await api.getKbEntries(clientId);
        setEntries((prev) => {
          const same =
            prev.length === data.length &&
            prev.every(
              (e, i) =>
                e.id === data[i].id &&
                e.status === data[i].status &&
                e.title === data[i].title
            );
          return same ? prev : data;
        });
      } catch {
        /* keep previous */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [hasProcessing, clientId]);

  async function handleUpload({ file, category }) {
    const result = await api.uploadKbEntry({ file, clientId, category });
    const optimistic = {
      id: result.id,
      category,
      title: file.name.replace(/\.[^.]+$/, ""),
      status: "processing",
      source_type: (file.name.split(".").pop() || "txt").toLowerCase(),
      filename: file.name,
      created_at: new Date().toISOString(),
      excerpt: `Procesando ${file.name}…`,
    };
    setEntries((prev) => [optimistic, ...prev.filter((e) => e.id !== result.id)]);
  }

  function handleDeleted(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
  }

  return (
    <AppShell onUpload={() => setUploadOpen(true)}>
      {loading && !entries.length && !error ? (
        <div className="page-center">
          <div className="spinner" />
        </div>
      ) : (
        <BrainCanvas
          clientName={client?.name || clientId}
          entries={entries}
          error={error}
          onRetry={loadEntries}
          onLeafClick={(entry) => setSelectedId(entry.id)}
          onGhostClick={(category) => {
            setUploadCategory(category);
            setUploadOpen(true);
          }}
          onAgentClick={(agent, category) => {
            setSelectedAgent(agent);
            setSelectedCategory(category);
          }}
        />
      )}

      <UploadDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialCategory={uploadCategory}
        onUpload={handleUpload}
      />

      {selectedAgent ? (
        <AgentDocView
          agent={selectedAgent}
          category={selectedCategory}
          onClose={() => setSelectedAgent(null)}
        />
      ) : null}

      {selectedId ? (
        <DetailPanel
          entryId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </AppShell>
  );
}
