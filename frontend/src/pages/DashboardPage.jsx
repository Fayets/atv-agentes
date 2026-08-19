import { useCallback, useEffect, useMemo, useState } from "react";
// KB (getKbEntries) no implementado en el backend — entries siempre vacío
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

  const loadEntries = useCallback(() => {
    setEntries([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleUpload() {
    // KB no implementado aún
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
