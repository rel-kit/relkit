"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { OverlayDialog } from "../components/ui/dialog";
import { ComboboxField } from "../components/ui/select";
import { navigation } from "./navigation-data";

export function CommandPalette({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(
    () =>
      navigation
        .filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()))
        .map((item) => ({ id: item.href, label: item.label, description: item.group })),
    [query],
  );
  const navigate = (href: string): void => {
    onOpenChange(false);
    window.location.assign(href);
  };
  return (
    <OverlayDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      trigger={
        <Button variant="secondary" className="command-trigger" aria-label="Search inspector">
          <Search aria-hidden="true" className="size-4" />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </Button>
      }
      title="Search inspector"
      description="Jump to a capability, runtime signal, or API tool."
    >
      <ComboboxField
        label="Destination"
        items={items}
        value={query}
        onChange={setQuery}
        onSelect={navigate}
      />
      <div className="mt-4 grid gap-1">
        {items.map((item) => (
          <button
            className="command-result"
            key={item.id}
            type="button"
            onClick={() => navigate(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">No destinations match.</p>
        )}
      </div>
    </OverlayDialog>
  );
}
