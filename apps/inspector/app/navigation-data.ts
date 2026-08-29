import {
  BookOpen,
  Bot,
  Clock3,
  Database,
  FileText,
  Globe2,
  Inbox,
  Layers3,
  LayoutDashboard,
  Network,
  Radio,
  Route,
  ShieldCheck,
  SquareFunction,
  Stethoscope,
  Waypoints,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SCALAR_API_REFERENCE_URL } from "../lib/api-reference";

export const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/graph", label: "Graph", icon: Network },
      { href: "/domains", label: "Domains", icon: Layers3 },
      { href: "/routes", label: "Routes", icon: Route },
      { href: "/middlewares", label: "Middleware", icon: ShieldCheck },
      {
        href: SCALAR_API_REFERENCE_URL,
        label: "API Reference",
        icon: BookOpen,
        external: true,
      },
      { href: "/functions", label: "Functions", icon: SquareFunction },
      { href: "/errors", label: "Errors", icon: ShieldCheck },
    ],
  },
  {
    label: "Runtime",
    items: [
      { href: "/jobs", label: "Jobs", icon: Clock3 },
      { href: "/events", label: "Events & listeners", icon: Radio },
      { href: "/buckets", label: "Buckets", icon: Database },
      { href: "/cache", label: "Cache", icon: Layers3 },
      { href: "/providers", label: "Providers", icon: Globe2 },
      { href: "/tools", label: "Tools", icon: Wrench },
      { href: "/agents", label: "Agents", icon: Bot },
    ],
  },
  {
    label: "Signals",
    items: [
      { href: "/requests", label: "Requests", icon: Inbox },
      { href: "/logs", label: "Logs", icon: FileText },
      { href: "/traces", label: "Traces", icon: Waypoints },
      { href: "/env", label: "Environment", icon: Globe2 },
      { href: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
    ],
  },
] satisfies readonly {
  label: string;
  items: readonly { href: string; label: string; icon: LucideIcon; external?: boolean }[];
}[];

export const navigation = navigationGroups.flatMap(({ label: group, items }) =>
  items.map((item) => ({ ...item, group })),
);
