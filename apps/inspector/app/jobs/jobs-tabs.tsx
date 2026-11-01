"use client";

import { CalendarClock, History, ListTree, Server } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Neon WorkspaceTabs-style underline tabs; each tab stays a real link so views are shareable. */
const tabs = [
  ["Definitions", "/jobs", ListTree],
  ["Runs", "/jobs/runs", History],
  ["Schedules", "/jobs/schedules", CalendarClock],
  ["Services", "/jobs/services", Server],
] as const;

export function JobsTabs() {
  const pathname = usePathname() ?? "/jobs";
  return (
    <nav
      aria-label="Jobs views"
      className="neon-scroll-fade mb-4 flex gap-5 overflow-x-auto border-b border-border"
    >
      {tabs.map(([label, href, Icon]) => {
        const active = pathname === href || (href !== "/jobs" && pathname.startsWith(`${href}/`));
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground no-underline outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
