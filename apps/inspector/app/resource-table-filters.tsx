import { RotateCcw, Search } from "lucide-react";
import { Button } from "../components/ui/button";
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

/** One-line toolbar: search first, narrowing fields after, reset at the end. */
export function ResourceTableFilters(props: ResourceTableFiltersProps) {
  const update = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    props.resetPage();
  };
  const active =
    props.search !== "" ||
    props.domain !== "" ||
    props.layer !== "" ||
    props.kind !== "all" ||
    props.status !== "all";
  return (
    <div
      role="search"
      className="resource-toolbar flex flex-wrap items-center gap-2"
      aria-label={`${props.title} filters`}
    >
      <Field
        compact
        className="min-w-56 flex-1"
        icon={<Search />}
        label={`Search ${props.noun}`}
        value={props.search}
        onChange={update(props.setSearch)}
        placeholder={`Search ${props.noun} by ID or metadata…`}
      />
      <Field
        compact
        className="w-40"
        label="Domain"
        value={props.domain}
        onChange={update(props.setDomain)}
        placeholder="Domain"
      />
      <Field
        compact
        className="w-36"
        label="Layer"
        value={props.layer}
        onChange={update(props.setLayer)}
        placeholder="Layer"
      />
      {props.kindOptions.length > 0 && (
        <SelectField
          compact
          label="Kind"
          items={[allChoice, ...props.kindOptions]}
          value={props.kind}
          onChange={update(props.setKind)}
        />
      )}
      {props.statusOptions.length > 0 && (
        <SelectField
          compact
          label="Status"
          items={[allChoice, ...props.statusOptions]}
          value={props.status}
          onChange={update(props.setStatus)}
        />
      )}
      <Button variant="ghost" size="sm" isDisabled={!active} onPress={props.clear}>
        <RotateCcw aria-hidden="true" /> Reset filters
      </Button>
    </div>
  );
}

const allChoice = { id: "all", label: "All" } as const;
