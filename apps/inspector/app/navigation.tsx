"use client";

import { usePathname } from "next/navigation";
import { cx } from "../lib/cx";
import { navigationGroups } from "./navigation-data";

export function InspectorNavigation({ collapsed = false }: { readonly collapsed?: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Inspector sections">
      {navigationGroups.map((group) => (
        <section className="nav-group" key={group.label} aria-labelledby={`${group.label}-nav`}>
          <h2 className={cx(collapsed && "sr-only")} id={`${group.label}-nav`}>
            {group.label}
          </h2>
          <ul className="nav-list">
            {group.items.map((item) => (
              <li key={item.href}>
                <a
                  className="nav-link"
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
