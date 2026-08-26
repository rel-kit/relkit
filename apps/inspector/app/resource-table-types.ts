import type { ReactNode } from "react";
import type { Choice } from "../components/ui/select";
import type { InspectorPage, InspectorQuery } from "../lib/api-types";

export interface ResourceTableItem {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface ResourceTableColumn<Item extends ResourceTableItem> {
  readonly key: string;
  readonly label: string;
  readonly render: (item: Item) => ReactNode;
}

export interface ResourceTableProps<Item extends ResourceTableItem> {
  readonly title: string;
  readonly description: string;
  readonly noun: string;
  readonly load: (query: InspectorQuery) => Promise<InspectorPage<Item>>;
  readonly columns: readonly ResourceTableColumn<Item>[];
  readonly href?: (item: Item) => string;
  readonly openLabel?: string;
  readonly kindOptions?: readonly Choice[];
  readonly statusOptions?: readonly Choice[];
  readonly details?: (item: Item) => ReactNode;
}
