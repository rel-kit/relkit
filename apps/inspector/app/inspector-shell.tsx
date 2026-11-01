"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { GitCommitHorizontal, Moon, MoreHorizontal, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { Breadcrumbs } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { DropdownMenu } from "../components/ui/dropdown-menu";
import { Tooltip } from "../components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { CopyButton } from "../components/blocks/copy-button";
import { useInspectorGraph } from "../lib/use-graph";
import { SCALAR_API_REFERENCE_URL } from "../lib/api-reference";
import { navigationCounts } from "../lib/graph-index";
import { middleTruncate } from "../lib/format";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPalette } from "./command-palette";
import { navigation } from "./navigation-data";
import { DevelopmentFailureBanner } from "./development-failure-banner";
import { applyInspectorTheme, readInspectorTheme, type InspectorTheme } from "./theme-storage";

export function InspectorShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const graph = useInspectorGraph();
  const [searchOpen, setSearchOpen] = useState(false);
  // Dark is rendered on the server and corrected before paint by the script in layout.tsx;
  // this state only mirrors what is already applied.
  const [theme, setTheme] = useState<InspectorTheme>("dark");

  useEffect(() => setTheme(readInspectorTheme()), []);
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
    applyInspectorTheme(next);
  };
  const status = graph.error ? "offline" : graph.connection;
  const generationId = graph.graph?.generationId;
  const graphHash = graph.graph?.graphHash;

  return (
    <SidebarProvider className="inspector-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar status={status} counts={navigationCounts(graph.graph)} />
      <SidebarInset className="shell-workspace">
        <header className="shell-header">
          <SidebarTrigger aria-label="Toggle navigation" />
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <Breadcrumbs items={breadcrumbs(pathname)} />
          <div className="header-actions">
            <div className="generation-bar" aria-label="Active generation">
              <GitCommitHorizontal aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <code title={generationId}>{generationId ?? "awaiting"}</code>
              {graphHash ? (
                <>
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                  <code title={graphHash}>
                    {middleTruncate(graphHash.replace(/^sha256:/, ""), 12)}
                  </code>
                  <CopyButton value={graphHash} label="Copy graph hash" />
                </>
              ) : null}
            </div>
            <CommandPalette isOpen={searchOpen} onOpenChange={setSearchOpen} graph={graph.graph} />
            <StatusBadge
              className="health-badge"
              data-state={status}
              tone={status === "connected" ? "live" : statusTone(status)}
              label={status}
            />
            <Tooltip
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
                  onPress={toggleTheme}
                >
                  {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
                </Button>
              }
            >
              Change theme
            </Tooltip>
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="icon" aria-label="Open resources">
                  <MoreHorizontal aria-hidden="true" />
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
        <DevelopmentFailureBanner {...(generationId === undefined ? {} : { generationId })} />
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
