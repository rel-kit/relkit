"use client";

import { usePathname } from "next/navigation";
import { cx } from "../lib/cx";
import { navigationGroups } from "./navigation-data";

export function InspectorNavigation({ collapsed = false }: { readonly collapsed?: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="sidebar-navigation" aria-label="Inspector sections">
      {navigationGroups.map((group) => (
        <section className="sidebar-group" key={group.label} aria-labelledby={`${group.label}-nav`}>
          <h2
            className={cx("sidebar-group-label", collapsed && "sr-only")}
            id={`${group.label}-nav`}
          >
            {group.label}
          </h2>
          <ul className="sidebar-menu">
            {group.items.map((item) => {
              const active = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <a
                    className="sidebar-menu-button"
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-active={active}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon aria-hidden="true" className="sidebar-menu-icon" />
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
