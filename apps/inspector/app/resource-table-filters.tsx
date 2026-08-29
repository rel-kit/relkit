import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field } from "../components/ui/field";
import { SelectField } from "../components/ui/select";

interface FilterOption {
  readonly id: string;
  readonly label: string;
}

interface ResourceTableFiltersProps {
  readonly title: string;
  readonly noun: string;
  readonly search: string;
  readonly kind: string;
  readonly status: string;
  readonly domain: string;
  readonly layer: string;
  readonly kindOptions: readonly FilterOption[];
  readonly statusOptions: readonly FilterOption[];
  readonly setSearch: (value: string) => void;
  readonly setKind: (value: string) => void;
  readonly setStatus: (value: string) => void;
  readonly setDomain: (value: string) => void;
  readonly setLayer: (value: string) => void;
  readonly resetPage: () => void;
  readonly clear: () => void;
}

export function ResourceTableFilters(props: ResourceTableFiltersProps) {
  const update = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    props.resetPage();
  };
  return (
    <Card className="resource-toolbar" aria-label={`${props.title} filters`}>
      <div className="resource-filter-heading">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        <strong>Filters</strong>
        <span>Search and narrow the active collection.</span>
      </div>
      <Field
        label={`Search ${props.noun}`}
        value={props.search}
        onChange={update(props.setSearch)}
        placeholder={`Search ${props.noun} IDs and metadata`}
      />
      <Field
        label="Domain"
        value={props.domain}
        onChange={update(props.setDomain)}
        placeholder="Filter by domain ID"
      />
      <Field
        label="Layer"
        value={props.layer}
        onChange={update(props.setLayer)}
        placeholder="Filter by graph layer"
      />
      {props.kindOptions.length > 0 && (
        <SelectField
          label="Kind"
          items={[allChoice, ...props.kindOptions]}
          value={props.kind}
          onChange={update(props.setKind)}
        />
      )}
      {props.statusOptions.length > 0 && (
        <SelectField
          label="Status"
          items={[allChoice, ...props.statusOptions]}
          value={props.status}
          onChange={update(props.setStatus)}
        />
      )}
      <div className="resource-filter-footer">
        <Button variant="ghost" size="sm" onPress={props.clear}>
          <RotateCcw aria-hidden="true" className="size-3.5" /> Reset filters
        </Button>
      </div>
    </Card>
  );
}

const allChoice = { id: "all", label: "All" } as const;
