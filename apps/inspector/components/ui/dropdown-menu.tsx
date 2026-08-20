"use client";

import type { ReactNode } from "react";
import { Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export function DropdownMenu({
  trigger,
  items,
  onAction,
}: {
  readonly trigger: ReactNode;
  readonly items: readonly DropdownItem[];
  readonly onAction: (id: string) => void;
}) {
  return (
    <MenuTrigger>
      {trigger}
      <Popover className="z-50 min-w-48 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1 shadow-xl">
        <Menu items={items} onAction={(key) => onAction(String(key))} className="outline-none">
          {(item) => (
            <MenuItem
              id={item.id}
              className="cursor-default rounded-md px-2.5 py-2 text-sm outline-none hover:bg-[var(--panel-muted)] focus:bg-[var(--panel-muted)]"
            >
              <strong className="block font-medium">{item.label}</strong>
              {item.description && (
                <small className="text-[var(--muted)]">{item.description}</small>
              )}
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
