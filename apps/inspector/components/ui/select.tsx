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
  readonly items: readonly Choice[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly onSelect?: (value: string) => void;
}

export function SelectField({ label, items, value, onChange }: ChoiceFieldProps) {
  return (
    <Select
      className="grid gap-1.5"
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
    >
      <Label className="text-xs font-semibold">{label}</Label>
      <Button className="flex h-9 items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm outline-none focus:border-[var(--accent)]">
        <SelectValue />
        <ChevronDown aria-hidden="true" className="size-4 text-[var(--muted)]" />
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
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 focus-within:border-[var(--accent)]">
        <Search aria-hidden="true" className="size-4 text-[var(--muted)]" />
        <Input className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
      <ChoicePopover items={items} />
    </ComboBox>
  );
}

function ChoicePopover({ items }: { readonly items: readonly Choice[] }) {
  return (
    <Popover className="z-50 min-w-[var(--trigger-width)] rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1 shadow-xl">
      <ListBox items={items} className="max-h-72 overflow-auto outline-none">
        {(item) => (
          <ListBoxItem
            id={item.id}
            textValue={item.label}
            className="group flex cursor-default items-start gap-2 rounded-md px-2.5 py-2 text-sm outline-none hover:bg-[var(--panel-muted)] focus:bg-[var(--panel-muted)]"
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 size-3.5 opacity-0 group-selected:opacity-100"
            />
            <span>
              <strong className="block font-medium">{item.label}</strong>
              {item.description && (
                <small className="text-[var(--muted)]">{item.description}</small>
              )}
            </span>
          </ListBoxItem>
        )}
      </ListBox>
    </Popover>
  );
}
