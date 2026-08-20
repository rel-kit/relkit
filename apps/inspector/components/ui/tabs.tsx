"use client";

import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export function ContentTabs({
  items,
  label,
}: {
  readonly items: readonly TabItem[];
  readonly label: string;
}) {
  return (
    <Tabs className="grid gap-4">
      <TabList aria-label={label} className="flex gap-1 border-b border-[var(--line)]">
        {items.map((item) => (
          <Tab
            className="cursor-default border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[var(--muted)] outline-none selected:border-[var(--accent)] selected:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            id={item.id}
            key={item.id}
          >
            {item.label}
          </Tab>
        ))}
      </TabList>
      {items.map((item) => (
        <TabPanel className="outline-none" id={item.id} key={item.id}>
          {item.content}
        </TabPanel>
      ))}
    </Tabs>
  );
}
