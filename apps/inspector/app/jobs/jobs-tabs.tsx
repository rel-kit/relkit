"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["Definitions", "/jobs"],
  ["Runs", "/jobs/runs"],
  ["Schedules", "/jobs/schedules"],
  ["Services", "/jobs/services"],
] as const;

export function JobsTabs() {
  const pathname = usePathname() ?? "/jobs";
  return (
    <nav
      aria-label="Jobs views"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--line)]"
    >
      {tabs.map(([label, href]) => {
        const active = pathname === href || (href !== "/jobs" && pathname.startsWith(`${href}/`));
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="border-b-2 border-transparent px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--ink)] aria-[current=page]:border-[var(--accent)] aria-[current=page]:text-[var(--ink)]"
            href={href}
            key={href}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
