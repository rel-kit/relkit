/*
 * Schema property list in the style of Neon UI SchemaExplorer (https://ui.neon.com/database/schema-explorer):
 * mono field names, right-aligned muted types, required/optional marks and indented nesting.
 * Non-schema contract data (mappings, edges, summaries) falls back to an indented key/value tree.
 */
import type { ReactNode } from "react";
import { Section } from "../components/blocks/section";
import { CopyButton } from "../components/blocks/copy-button";
import { schemaRecord, schemaStrings, schemaText, unwrapSchema } from "../lib/schema-model";
import { cn } from "../lib/utils";

type SchemaRecord = Record<string, unknown>;

const MAX_DEPTH = 8;

export function SchemaPanel({
  title,
  value,
  eyebrow: _eyebrow,
  className,
}: {
  readonly title: string;
  readonly value: unknown;
  /** Kept for callers; the redesigned panel no longer shows an eyebrow line. */
  readonly eyebrow?: string;
  readonly className?: string;
}) {
  const id = `${headingId(title)}-schema`;
  const count = fieldCount(value);
  return (
    <Section
      id={id}
      title={title}
      flush
      className={cn("schema-panel", className)}
      actions={
        value === undefined ? null : (
          <>
            {count === undefined ? null : (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {count} {count === 1 ? "field" : "fields"}
              </span>
            )}
            <CopyButton value={json(value)} label={`Copy ${title}`} />
          </>
        )
      }
    >
      <div className="neon-scroll-fade max-h-[32rem] overflow-y-auto p-1.5">
        <SchemaViewer value={value} />
      </div>
    </Section>
  );
}

export function SchemaViewer({ value }: { readonly value: unknown }) {
  if (value === undefined)
    return <p className="m-0 px-2.5 py-2 text-xs text-muted-foreground">Not declared</p>;
  return (
    <div className="schema-viewer min-w-0 text-xs">
      <SchemaNode value={unwrapSchema(value)} depth={0} />
    </div>
  );
}

function SchemaNode({ value, depth }: { readonly value: unknown; readonly depth: number }) {
  if (value === null || typeof value !== "object") {
    return (
      <div className="px-2.5 py-1.5">
        <Literal value={value} />
      </div>
    );
  }
  if (Array.isArray(value)) return <ArrayRows items={value} depth={depth} />;
  const schema = value as SchemaRecord;
  if (!isSchemaLike(schema)) return <RecordRows record={schema} depth={depth} />;

  const properties = schemaRecord(schema.properties);
  if (properties) {
    return (
      <>
        <SchemaSummary schema={schema} />
        <PropertyRows
          properties={properties}
          required={schemaStrings(schema.required)}
          depth={depth}
        />
      </>
    );
  }
  const nested = nestedProperties(schema);
  return (
    <>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
        <TypeLabel schema={schema} />
        <Facets schema={schema} />
        {schemaText(schema.description) ? (
          <span className="min-w-0 text-[11px] text-muted-foreground">
            {schemaText(schema.description)}
          </span>
        ) : null}
      </div>
      {nested && depth < MAX_DEPTH ? (
        <Indent>
          <PropertyRows
            properties={nested.properties}
            required={nested.required}
            depth={depth + 1}
          />
        </Indent>
      ) : null}
    </>
  );
}

/** Root-level description and facets of an object schema, shown above its properties. */
function SchemaSummary({ schema }: { readonly schema: SchemaRecord }) {
  const description = schemaText(schema.description);
  if (!description && schema.nullable !== true) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-2.5 pt-1 pb-1.5 text-[11px] text-muted-foreground">
      {schema.nullable === true ? <Mark>nullable</Mark> : null}
      {description ? <span>{description}</span> : null}
    </div>
  );
}

function PropertyRows({
  properties,
  required,
  depth,
}: {
  readonly properties: SchemaRecord;
  readonly required: readonly string[];
  readonly depth: number;
}) {
  const entries = Object.entries(properties);
  if (entries.length === 0)
    return <p className="m-0 px-2.5 py-1.5 text-xs text-muted-foreground">No fields declared</p>;
  const requiredSet = new Set(required);
  return (
    <ul className="m-0 list-none space-y-px p-0">
      {entries.map(([name, raw]) => {
        const property = schemaRecord(unwrapSchema(raw)) ?? {};
        const description = schemaText(property.description);
        const nested = nestedProperties(property);
        const hasFacets = facetList(property).length > 0;
        return (
          <li key={name} className="min-w-0">
            <div className="group/row flex min-h-8 min-w-0 items-center gap-2 rounded-md px-2.5 py-1 hover:bg-muted/40">
              <code className="min-w-0 truncate bg-transparent p-0 font-mono text-xs text-foreground">
                {name}
              </code>
              {requiredSet.has(name) ? <Mark tone="strong">required</Mark> : <Mark>optional</Mark>}
              <span className="ml-auto min-w-0 shrink-0 pl-2 text-right">
                <TypeLabel schema={property} />
              </span>
            </div>
            {description || hasFacets ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2.5 pb-1.5 text-[11px] text-muted-foreground">
                <Facets schema={property} />
                {description ? <span className="min-w-0">{description}</span> : null}
              </div>
            ) : null}
            {nested && depth < MAX_DEPTH ? (
              <Indent>
                <PropertyRows
                  properties={nested.properties}
                  required={nested.required}
                  depth={depth + 1}
                />
              </Indent>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Plain records (route mappings, summaries): key on the left, scalar or nested value. */
function RecordRows({ record, depth }: { readonly record: SchemaRecord; readonly depth: number }) {
  const entries = Object.entries(record).filter(([key]) => !hiddenKeys.has(key));
  if (entries.length === 0)
    return <p className="m-0 px-2.5 py-1.5 text-xs text-muted-foreground">No fields declared</p>;
  return (
    <ul className="m-0 list-none space-y-px p-0">
      {entries.map(([key, raw]) => {
        const entry = unwrapSchema(raw);
        const scalar = entry === null || typeof entry !== "object";
        const emptyArray = Array.isArray(entry) && entry.length === 0;
        return (
          <li key={key} className="min-w-0">
            <div className="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-2.5 py-1 hover:bg-muted/40">
              <code className="min-w-0 shrink-0 truncate bg-transparent p-0 font-mono text-xs text-foreground">
                {key}
              </code>
              <span className="ml-auto min-w-0 truncate pl-2 text-right">
                {scalar ? (
                  <Literal value={entry} />
                ) : emptyArray ? (
                  <Quiet>[]</Quiet>
                ) : (
                  <TypeLabel schema={entry} />
                )}
              </span>
            </div>
            {!scalar && !emptyArray && depth < MAX_DEPTH ? (
              <Indent>
                <SchemaNode value={entry} depth={depth + 1} />
              </Indent>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ArrayRows({
  items,
  depth,
}: {
  readonly items: readonly unknown[];
  readonly depth: number;
}) {
  if (items.length === 0)
    return <p className="m-0 px-2.5 py-1.5 text-xs text-muted-foreground">Empty list</p>;
  if (items.every((item) => item === null || typeof item !== "object"))
    return (
      <div className="flex flex-wrap gap-1 px-2.5 py-1.5">
        {items.map((item, index) => (
          <Literal key={index} value={item} chip />
        ))}
      </div>
    );
  return (
    <ul className="m-0 list-none space-y-px p-0">
      {items.map((item, index) => (
        <li key={index} className="min-w-0">
          <div className="flex h-7 items-center gap-2 px-2.5">
            <Quiet>[{index}]</Quiet>
            <span className="ml-auto">
              <TypeLabel schema={item} />
            </span>
          </div>
          {depth < MAX_DEPTH ? (
            <Indent>
              <SchemaNode value={unwrapSchema(item)} depth={depth + 1} />
            </Indent>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Indent({ children }: { readonly children: ReactNode }) {
  return <div className="ml-3.5 min-w-0 border-l border-border/70 pl-1.5">{children}</div>;
}

function TypeLabel({ schema }: { readonly schema: unknown }) {
  return (
    <span className="font-mono text-[11px] text-muted-foreground" title="Type">
      {typeLabel(schema)}
    </span>
  );
}

function Facets({ schema }: { readonly schema: SchemaRecord }) {
  const facets = facetList(schema);
  if (facets.length === 0) return null;
  return (
    <>
      {facets.map((facet) => (
        <Mark key={facet}>{facet}</Mark>
      ))}
    </>
  );
}

function Mark({ children, tone }: { readonly children: ReactNode; readonly tone?: "strong" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1 font-mono text-[10px] leading-4 whitespace-nowrap",
        tone === "strong"
          ? "border border-border bg-muted text-foreground/80"
          : "border border-transparent text-muted-foreground/80",
      )}
    >
      {children}
    </span>
  );
}

function Literal({ value, chip }: { readonly value: unknown; readonly chip?: boolean }) {
  return (
    <code
      className={cn(
        "bg-transparent p-0 font-mono text-[11px] break-all",
        typeof value === "string" ? "text-foreground/85" : "text-info",
        chip && "rounded-sm border border-border bg-muted/50 px-1.5 py-px",
      )}
    >
      {formatValue(value)}
    </code>
  );
}

function Quiet({ children }: { readonly children: ReactNode }) {
  return <span className="font-mono text-[11px] text-muted-foreground">{children}</span>;
}

/** Short type description: `string`, `string | null`, `object[]`, `enum`, `ref`. */
export function typeLabel(value: unknown, depth = 0): string {
  const schema = schemaRecord(unwrapSchema(value));
  if (schema === undefined) {
    if (Array.isArray(value)) return `list · ${value.length}`;
    return value === null ? "null" : typeof value;
  }
  if (depth > 4) return "…";
  const type = schema.type;
  if (typeof type === "string") {
    if (type === "array" && schema.items !== undefined)
      return `${typeLabel(schema.items, depth + 1)}[]`;
    return schema.nullable === true ? `${type} | null` : type;
  }
  if (Array.isArray(type) && type.every((item) => typeof item === "string"))
    return type.join(" | ");
  const branches = branchList(schema);
  if (branches) {
    const labels = [...new Set(branches.map((branch) => typeLabel(branch, depth + 1)))];
    return labels.join(" | ");
  }
  if (schema.enum !== undefined) return "enum";
  if (schema.const !== undefined) return "const";
  if (typeof schema.$ref === "string") return schema.$ref.split("/").pop() || "ref";
  if (schema.properties !== undefined) return "object";
  if (schema.items !== undefined) return `${typeLabel(schema.items, depth + 1)}[]`;
  return isSchemaLike(schema) ? "any" : "object";
}

function facetList(schema: SchemaRecord): readonly string[] {
  const facets: string[] = [];
  const format = schemaText(schema.format);
  if (format) facets.push(format);
  if (Array.isArray(schema.enum))
    facets.push(...schema.enum.slice(0, 8).map((item) => formatValue(item)));
  if (Array.isArray(schema.enum) && schema.enum.length > 8)
    facets.push(`+${schema.enum.length - 8}`);
  if (schema.const !== undefined) facets.push(`= ${formatValue(schema.const)}`);
  if (schema.default !== undefined) facets.push(`default ${formatValue(schema.default)}`);
  for (const [key, label] of [
    ["minLength", "min"],
    ["maxLength", "max"],
    ["minimum", "≥"],
    ["maximum", "≤"],
    ["minItems", "min items"],
    ["maxItems", "max items"],
  ] as const) {
    const bound = schema[key];
    if (typeof bound === "number") facets.push(`${label} ${bound}`);
  }
  if (typeof schema.pattern === "string") facets.push(`/${schema.pattern}/`);
  return facets;
}

/** Object properties reachable through an object, an array of objects or object variants. */
function nestedProperties(
  schema: SchemaRecord,
): { properties: SchemaRecord; required: readonly string[] } | undefined {
  const properties = schemaRecord(schema.properties);
  if (properties && Object.keys(properties).length > 0)
    return { properties, required: schemaStrings(schema.required) };
  const items = schemaRecord(unwrapSchema(schema.items));
  if (items) return nestedProperties(items);
  for (const branch of branchList(schema) ?? []) {
    const nested = schemaRecord(unwrapSchema(branch));
    const found = nested ? nestedProperties(nested) : undefined;
    if (found) return found;
  }
  return undefined;
}

function branchList(schema: SchemaRecord): readonly unknown[] | undefined {
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const branches = schema[key];
    if (Array.isArray(branches) && branches.length > 0) return branches;
  }
  return undefined;
}

const schemaKeys = [
  "type",
  "properties",
  "items",
  "oneOf",
  "anyOf",
  "allOf",
  "enum",
  "const",
  "$ref",
] as const;

function isSchemaLike(value: SchemaRecord): boolean {
  if (typeof value.type === "string" || Array.isArray(value.type)) return true;
  if (value.$relkit === "schema") return true;
  return schemaKeys.some((key) => key !== "type" && value[key] !== undefined);
}

const hiddenKeys = new Set(["$schema", "$id"]);

function fieldCount(value: unknown): number | undefined {
  const schema = schemaRecord(unwrapSchema(value));
  if (schema === undefined || !isSchemaLike(schema)) return undefined;
  const nested = nestedProperties(schema);
  return nested ? Object.keys(nested.properties).length : undefined;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return "unavailable";
  }
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "";
  }
}

function headingId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "schema"
  );
}
