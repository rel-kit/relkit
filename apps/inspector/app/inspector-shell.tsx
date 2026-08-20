"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Activity, ExternalLink, Moon, MoreHorizontal, PanelLeft, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { DropdownMenu } from "../components/ui/dropdown-menu";
import { Separator } from "../components/ui/separator";
import { Tooltip } from "../components/ui/tooltip";
import { useInspectorGraph } from "../lib/use-graph";
import { CommandPalette } from "./command-palette";
import { navigation } from "./navigation-data";
import { InspectorNavigation } from "./navigation";

export function InspectorShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const graph = useInspectorGraph();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("zsys.inspector.theme");
    const initial =
      stored === "dark" || stored === "light"
        ? stored
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);
  useEffect(() => {
    const openSearch = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const toggleTheme = (): void => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("zsys.inspector.theme", next);
    document.documentElement.dataset.theme = next;
  };
  const openUtility = (id: string): void => {
    window.location.assign(id === "docs" ? "https://zsys.dev/docs" : "/api-reference");
  };
  const status = graph.error ? "offline" : graph.connection;

  return (
    <div
      className="inspector-shell"
      data-sidebar-collapsed={collapsed}
      data-mobile-open={mobileOpen}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="shell-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            Z
          </span>
          {!collapsed && (
            <div>
              <strong>ZSYS</strong>
              <small>Inspector</small>
            </div>
          )}
        </div>
        <Separator />
        <div className="sidebar-scroll">
          <InspectorNavigation collapsed={collapsed} />
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" data-state={status} aria-hidden="true" />
          {!collapsed && <span>{status === "connected" ? "Backend healthy" : status}</span>}
        </div>
      </aside>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />
      <div className="shell-workspace">
        <header className="shell-header">
          <Tooltip
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle navigation"
                onPress={() => {
                  if (matchMedia("(max-width: 760px)").matches) setMobileOpen((value) => !value);
                  else setCollapsed((value) => !value);
                }}
              >
                <PanelLeft aria-hidden="true" className="size-4" />
              </Button>
            }
          >
            Toggle navigation
          </Tooltip>
          <Breadcrumbs items={breadcrumbs(pathname)} />
          <div className="header-actions">
            <CommandPalette isOpen={searchOpen} onOpenChange={setSearchOpen} />
            <Badge className="health-badge" data-state={status}>
              <Activity aria-hidden="true" className="size-3.5" /> {status}
            </Badge>
            <Tooltip
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
                  onPress={toggleTheme}
                >
                  {theme === "light" ? (
                    <Moon aria-hidden="true" className="size-4" />
                  ) : (
                    <Sun aria-hidden="true" className="size-4" />
                  )}
                </Button>
              }
            >
              Change theme
            </Tooltip>
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="icon" aria-label="Open resources">
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              }
              items={[
                { id: "api", label: "API Reference", description: "Open active Scalar docs" },
                { id: "docs", label: "Framework docs", description: "Open ZSYS guides" },
              ]}
              onAction={openUtility}
            />
          </div>
        </header>
        <div className="generation-bar">
          <span>
            Generation <code>{bounded(graph.graph?.generationId, "awaiting")}</code>
          </span>
          <span>
            Graph <code>{bounded(graph.graph?.graphHash, "unavailable")}</code>
          </span>
          <a href="/api-reference">
            API reference <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </div>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function breadcrumbs(pathname: string): readonly { label: string; href?: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Overview" }];
  const href = `/${parts[0]}`;
  const item = navigation.find((entry) => entry.href === href);
  const result: { label: string; href?: string }[] = [{ label: "Overview", href: "/" }];
  result.push(
    parts.length > 1
      ? { label: item?.label ?? parts[0]!, href }
      : { label: item?.label ?? parts[0]! },
  );
  if (parts.length > 1) result.push({ label: decodeURIComponent(parts.slice(1).join(" / ")) });
  return result;
}

function bounded(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.length <= 24 ? value : `${value.slice(0, 12)}…${value.slice(-8)}`;
}
