import { Badge } from "@/components/ui/badge";

const MAP = {
  processing: { label: "processing", variant: "secondary" },
  live: { label: "live", variant: "default" },
  error: { label: "error", variant: "destructive" },
};

export default function StatusPill({ status }) {
  const meta = MAP[status] || { label: status, variant: "outline" };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
