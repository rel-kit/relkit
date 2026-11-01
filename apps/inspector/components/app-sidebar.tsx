"use client";

import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navigationGroups } from "@/app/navigation-data";
import { cn } from "@/lib/utils";

export function AppSidebar({
  status = "offline",
  counts = {},
}: {
  readonly status?: string;
  /** Graph entity counts per destination href. */
  readonly counts?: Readonly<Record<string, number>>;
}) {
  const pathname = usePathname() ?? "/";
  const connected = status === "connected";
  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="RELKIT Inspector">
              <Link href="/" aria-label="RELKIT Inspector overview">
                <Image
                  className="brand-mark aspect-square size-7 rounded-md object-cover"
                  src="/logo.svg"
                  alt=""
                  width={28}
                  height={28}
                  priority
                />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-[13px] font-semibold">RELKIT</span>
                  <span className="text-[11px] text-muted-foreground">Inspector</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="neon-scroll-fade">
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="h-7 text-[11px] font-medium tracking-wide uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {group.items.map((item) => {
                  const active = !item.external && isCurrent(pathname, item.href);
                  const count = item.external ? undefined : counts[item.href];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="h-7 text-[13px]"
                      >
                        {item.external ? (
                          <a href={item.href} target="_blank" rel="noreferrer">
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                            <ExternalLink
                              aria-hidden="true"
                              className="ml-auto !size-3 text-muted-foreground"
                            />
                          </a>
                        ) : (
                          <Link href={item.href} aria-current={active ? "page" : undefined}>
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>
                      {count !== undefined && count > 0 ? (
                        <SidebarMenuBadge className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {count}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={`Backend ${status}`} className="h-8">
              <div>
                <span
                  aria-hidden="true"
                  className={cn(
                    "status-dot size-2 shrink-0 rounded-full",
                    connected
                      ? "neon-status-breathe bg-live text-live"
                      : status === "offline"
                        ? "bg-danger"
                        : "bg-warning",
                  )}
                />
                <span className="text-xs">{connected ? "Backend healthy" : status}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
