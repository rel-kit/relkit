"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Activity, ExternalLink, Moon, MoreHorizontal, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { DropdownMenu } from "../components/ui/dropdown-menu";
import { Tooltip } from "../components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { useInspectorGraph } from "../lib/use-graph";
import { SCALAR_API_REFERENCE_URL } from "../lib/api-reference";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPalette } from "./command-palette";
import { navigation } from "./navigation-data";

export function InspectorShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const graph = useInspectorGraph();
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("relkit.inspector.theme");
    const initial =
      stored === "dark" || stored === "light"
        ? stored
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    document.documentElement.classList.toggle("dark", initial === "dark");
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
    localStorage.setItem("relkit.inspector.theme", next);
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "dark");
  };
  const status = graph.error ? "offline" : graph.connection;

  return (
    <SidebarProvider className="inspector-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar status={status} />
      <SidebarInset className="shell-workspace">
        <header className="shell-header">
          <SidebarTrigger aria-label="Toggle navigation" />
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
                { id: "docs", label: "Framework docs", description: "Open RELKIT guides" },
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
          <a href={SCALAR_API_REFERENCE_URL} target="_blank" rel="noreferrer">
            API reference <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </div>
        <div id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function openUtility(id: string): void {
  window.open(
    id === "docs" ? "https://relkit.dev/docs" : SCALAR_API_REFERENCE_URL,
    "_blank",
    "noopener,noreferrer",
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
