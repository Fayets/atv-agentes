import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ClientCard from "@/components/ClientCard";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getClients();
      setClients(data);
    } catch {
      setError("No se pudieron cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell>
      <div className="h-full overflow-auto p-6 md:p-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Elegí un <span className="text-primary">cliente</span>
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Abrí su árbol Grounded para gestionar la base de conocimiento.
          </p>
        </header>

        {loading ? (
          <div className="page-center">
            <div className="spinner" />
          </div>
        ) : error ? (
          <div className="max-w-sm text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <Button onClick={load}>Reintentar</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <ClientCard key={c.id} client={c} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
