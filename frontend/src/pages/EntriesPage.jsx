import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import StatusPill from "@/components/StatusPill";
import UploadDrawer from "@/components/UploadDrawer";
import DetailPanel from "@/components/DetailPanel";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function EntriesPage() {
  const { clientId } = useParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getKbEntries(clientId);
      setEntries(data);
    } catch {
      setError("No se pudieron cargar las entries.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload({ file, category }) {
    const result = await api.uploadKbEntry({ file, clientId, category });
    setEntries((prev) => [
      {
        id: result.id,
        category,
        title: file.name.replace(/\.[^.]+$/, ""),
        status: "processing",
        source_type: (file.name.split(".").pop() || "txt").toLowerCase(),
        filename: file.name,
        created_at: new Date().toISOString(),
        excerpt: `Procesando ${file.name}…`,
      },
      ...prev,
    ]);
  }

  async function handleDelete(id) {
    await api.deleteKbEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <AppShell onUpload={() => setUploadOpen(true)}>
      <div className="h-full overflow-auto p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Entries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentos de la base de conocimiento de este cliente.
          </p>
        </div>

        {loading ? (
          <div className="page-center">
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <Button onClick={load}>Reintentar</Button>
          </div>
        ) : (
          <Card className="overflow-hidden border-white/10 bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Título</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Sin documentos todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-medium hover:text-primary"
                          onClick={() => setSelectedId(e.id)}
                        >
                          {e.title}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {api.CATEGORY_LABELS[e.category] || e.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusPill status={e.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.filename}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)}>
                          Borrar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <UploadDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
      />

      {selectedId ? (
        <DetailPanel
          entryId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={(id) => {
            setEntries((prev) => prev.filter((e) => e.id !== id));
            setSelectedId(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}
