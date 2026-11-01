"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

export interface Choice {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

interface ChoiceFieldProps {
  readonly label: string;
  /** Toolbar style: the label stays for assistive tech but is visually hidden. */
  readonly compact?: boolean;
  readonly items: readonly Choice[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly onSelect?: (value: string) => void;
}

export function SelectField({ label, items, value, onChange, compact = false }: ChoiceFieldProps) {
  return (
    <Select
      className="grid gap-1.5"
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
    >
      <Label className={compact ? "sr-only" : "text-xs font-medium"}>{label}</Label>
      <Button className="flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none data-[focus-visible]:border-ring data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/25">
        {compact ? <span className="text-muted-foreground">{label}:</span> : null}
        <SelectValue className="font-medium">
          {({ selectedText, defaultChildren }) => selectedText || defaultChildren}
        </SelectValue>
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </Button>
      <ChoicePopover items={items} />
    </Select>
  );
}

export function ComboboxField({ label, items, value, onChange, onSelect }: ChoiceFieldProps) {
  return (
    <ComboBox
      className="grid gap-1.5"
      inputValue={value}
      onInputChange={onChange}
      onSelectionChange={(key) => key !== null && (onSelect ?? onChange)(String(key))}
    >
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Search aria-hidden="true" className="size-4 text-muted-foreground" />
        <Input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          placeholder="Type a page, route, function…"
        />
      </div>
      <ChoicePopover items={items} />
    </ComboBox>
  );
}

function ChoicePopover({ items }: { readonly items: readonly Choice[] }) {
  return (
    <Popover className="z-50 min-w-[var(--trigger-width)] rounded-md border border-border bg-popover p-1 shadow-[var(--shadow)]">
      <ListBox items={items} className="max-h-72 overflow-auto outline-none">
        {(item) => (
          <ListBoxItem
            id={item.id}
            textValue={item.label}
            className="group flex cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none hover:bg-muted focus:bg-muted"
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 size-3.5 opacity-0 group-selected:opacity-100"
            />
            <span>
              <strong className="block font-medium">{item.label}</strong>
              {item.description && (
                <small className="text-muted-foreground">{item.description}</small>
              )}
            </span>
          </ListBoxItem>
        )}
      </ListBox>
    </Popover>
  );
}
