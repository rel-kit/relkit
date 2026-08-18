"use client";

import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Overview", group: "Workspace" },
  { href: "/graph", label: "Graph", group: "Workspace" },
  { href: "/routes", label: "Routes", group: "Workspace" },
  { href: "/functions", label: "Functions", group: "Workspace" },
  { href: "/jobs", label: "Jobs", group: "Runtime" },
  { href: "/events", label: "Events & listeners", group: "Runtime" },
  { href: "/buckets", label: "Buckets", group: "Runtime" },
  { href: "/cache", label: "Cache", group: "Runtime" },
  { href: "/tools", label: "Tools", group: "Runtime" },
  { href: "/agents", label: "Agents", group: "Runtime" },
  { href: "/requests", label: "Requests", group: "Signals" },
  { href: "/logs", label: "Logs", group: "Signals" },
  { href: "/traces", label: "Traces", group: "Signals" },
  { href: "/env", label: "Environment", group: "Signals" },
  { href: "/diagnostics", label: "Diagnostics", group: "Signals" },
] as const;

const groups = ["Workspace", "Runtime", "Signals"] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function InspectorNavigation() {
  const pathname = usePathname() ?? "/";

  return (
    <nav aria-label="Inspector sections">
      {groups.map((group) => (
        <section className="nav-group" key={group} aria-labelledby={`${group}-nav`}>
          <h2 id={`${group}-nav`}>{group}</h2>
          <ul className="nav-list">
            {navigation
              .filter((item) => item.group === group)
              .map((item) => (
                <li key={item.href}>
                  <a
                    className="nav-link"
                    href={item.href}
                    aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
