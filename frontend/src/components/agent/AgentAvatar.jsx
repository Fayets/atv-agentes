import {
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  FileText,
  Megaphone,
  MessageSquare,
  Mic,
  Search,
  Send,
  Tag,
  Users,
  Workflow,
} from "lucide-react";
import { categoryColor } from "@/lib/agents";
import { cn } from "@/lib/utils";

/** Mismos nombres de ícono que usa el mapa (CATEGORY_AGENTS.icon). */
export const AGENT_ICONS = {
  chart: BarChart3,
  send: Send,
  check: BadgeCheck,
  doc: FileText,
  mic: Mic,
  tag: Tag,
  users: Users,
  search: Search,
  chat: MessageSquare,
  flow: Workflow,
  bell: Megaphone,
  building: Building2,
};

/**
 * Identidad visual de un agente: cuadrado con el color de su categoría y su
 * ícono. La misma pieza en el ⌘K, en el workspace y en la lista de agentes,
 * para que cada agente se reconozca como un integrante del equipo.
 */
export function AgentAvatar({ icon, category, size = 36, className, glow = false }) {
  const Icon = AGENT_ICONS[icon] || Bot;
  const color = categoryColor(category);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl", className)}
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
        boxShadow: glow ? `0 0 28px color-mix(in srgb, ${color} 28%, transparent)` : undefined,
      }}
      aria-hidden="true"
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.8} />
    </span>
  );
}
