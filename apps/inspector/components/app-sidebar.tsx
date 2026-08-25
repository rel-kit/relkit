"use client";

import Link from "next/link";
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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navigationGroups } from "@/app/navigation-data";

export function AppSidebar({ status = "offline" }: { readonly status?: string }) {
  const pathname = usePathname() ?? "/";
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="ZSYS Inspector">
              <Link href="/" aria-label="ZSYS Inspector overview">
                <div className="brand-mark flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  Z
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">ZSYS</span>
                  <span>Inspector</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = !item.external && isCurrent(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        {item.external ? (
                          <a href={item.href} target="_blank" rel="noreferrer">
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </a>
                        ) : (
                          <Link href={item.href} aria-current={active ? "page" : undefined}>
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={`Backend ${status}`}>
              <div>
                <span
                  className={`status-dot ${status === "connected" ? "status-dot--connected" : ""}`}
                />
                <span>{status === "connected" ? "Backend healthy" : status}</span>
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
