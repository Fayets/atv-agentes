import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { MagicCard } from "@/components/magicui/magic-card";

export default function ClientCard({ client }) {
  return (
    <Link to={`/dashboard/${client.id}`} className="block rounded-2xl">
      <MagicCard className="min-h-[180px] rounded-2xl">
        <div className="flex min-h-[180px] flex-col gap-3 p-6">
          <span className="text-[11px] uppercase tracking-[0.16em] text-primary">
            {client.slug}
          </span>
          <h2 className="flex-1 text-2xl font-semibold tracking-tight">{client.name}</h2>
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            Abrir árbol
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </MagicCard>
    </Link>
  );
}
