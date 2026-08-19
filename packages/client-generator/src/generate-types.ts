import type { ApplicationGraph, FunctionNode, GraphNode, HttpTriggerConfig } from "@zsys/graph";
import { responseSchema, schemaAt, schemaType } from "./generate-schema.js";

export interface MappingLeaf {
  readonly inputPath: readonly string[];
  readonly outputPath: readonly string[];
  readonly kind: string;
  readonly name?: string;
  readonly value?: unknown;
  readonly optional: boolean;
  readonly defaulted: boolean;
}

export interface ResponseContract {
  readonly id: string;
  readonly kind: string;
  readonly status: number;
  readonly errorId?: string;
  readonly schema?: unknown;
}

export interface ClientRoute {
  readonly trigger: HttpGraphTrigger;
  readonly target: FunctionNode;
  readonly fields: readonly MappingLeaf[];
  readonly responses: readonly ResponseContract[];
}

export function clientRoutes(graph: ApplicationGraph): readonly ClientRoute[] {
  const functions = new Map(
    graph.nodes
      .filter((node): node is FunctionNode => node.kind === "function")
      .map((node) => [node.id, node]),
  );
  return graph.nodes
    .filter(isHttpTrigger)
    .map((trigger) => {
      const target = functions.get(trigger.targetFunctionId);
      if (target === undefined)
        throw new TypeError(
          `HTTP trigger "${trigger.id}" targets missing function "${trigger.targetFunctionId}".`,
        );
      return {
        trigger,
        target,
        fields: collectMappings(trigger.config.request),
        responses: responseContracts(trigger.config.responses),
      };
    })
    .sort((left, right) => left.trigger.id.localeCompare(right.trigger.id));
}

export function mappedInputType(route: ClientRoute): string {
  const root: InputTree = { fields: new Map() };
  if (route.fields.some((field) => field.kind === "whole-body" && field.inputPath.length === 0))
    return schemaType(route.target.input);
  for (const field of route.fields) {
    if (field.kind === "constant") continue;
    const schema = schemaAt(route.target.input, field.inputPath);
    addInputField(
      root,
      field.inputPath,
      schemaType(schema ?? (isParameter(field.kind) ? { type: "string" } : undefined)),
      { optional: field.optional || field.defaulted },
    );
  }
  return renderInputTree(root);
}

export function responseType(route: ClientRoute, response: ResponseContract): string {
  const schema =
    response.kind === "error"
      ? responseSchema(route, response)
      : (response.schema ?? responseSchema(route, response));
  return schemaType(schema);
}

function collectMappings(value: unknown): readonly MappingLeaf[] {
  const result: MappingLeaf[] = [];
  visitMapping(value, [], false, false, result);
  return result.sort(
    (left, right) =>
      left.inputPath.join(".").localeCompare(right.inputPath.join(".")) ||
      left.kind.localeCompare(right.kind) ||
      (left.name ?? "").localeCompare(right.name ?? ""),
  );
}

function visitMapping(
  value: unknown,
  path: readonly string[],
  optional: boolean,
  defaulted: boolean,
  result: MappingLeaf[],
): void {
  if (!isRecord(value) || typeof value.kind !== "string") return;
  if ((value.kind === "input" || value.kind === "nested") && isRecord(value.fields)) {
    for (const key of Object.keys(value.fields).sort())
      visitMapping(value.fields[key], [...path, key], optional, defaulted, result);
    return;
  }
  if (value.kind === "optional" || value.kind === "default" || value.kind === "transform") {
    visitMapping(
      value.value,
      path,
      optional || value.kind === "optional",
      defaulted || value.kind === "default",
      result,
    );
    return;
  }
  result.push({
    inputPath: path,
    outputPath:
      value.kind === "body" || value.kind === "multipart"
        ? [typeof value.name === "string" ? value.name : (path.at(-1) ?? "value")]
        : path,
    kind: value.kind,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(value.kind === "constant" ? { value: value.value } : {}),
    optional,
    defaulted,
  });
}

function responseContracts(value: unknown): readonly ResponseContract[] {
  const responses = (Array.isArray(value) ? value : []).filter(isRecord).map((entry) => ({
    id: typeof entry.id === "string" ? entry.id : "response",
    kind: typeof entry.kind === "string" ? entry.kind : "response",
    status: typeof entry.status === "number" ? entry.status : 0,
    ...(typeof entry.errorId === "string" ? { errorId: entry.errorId } : {}),
    ...(entry.schema === undefined || entry.schema === null ? {} : { schema: entry.schema }),
  }));
  if (!responses.some((response) => response.kind === "validation-error")) {
    responses.push({ id: "validation.422", kind: "validation-error", status: 422 });
  }
  return responses.sort(
    (left, right) => left.status - right.status || left.id.localeCompare(right.id),
  );
}

function addInputField(
  tree: InputTree,
  path: readonly string[],
  type: string,
  options: { readonly optional: boolean },
): void {
  const key = path[0];
  if (key === undefined) return;
  const field = tree.fields.get(key) ?? { optional: options.optional, type };
  if (path.length === 1) {
    field.optional = field.optional && options.optional;
    field.type = type;
  } else {
    field.children ??= { fields: new Map() };
    addInputField(field.children, path.slice(1), type, options);
  }
  tree.fields.set(key, field);
}

function renderInputTree(tree: InputTree): string {
  const entries = [...tree.fields.entries()].sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "{}";
  return `{ ${entries
    .map(([key, field]) => {
      const value = field.children === undefined ? field.type : renderInputTree(field.children);
      return `${JSON.stringify(key)}${field.optional ? "?" : ""}: ${value}`;
    })
    .join("; ")} }`;
}

interface InputTree {
  readonly fields: Map<string, InputField>;
}
interface InputField {
  optional: boolean;
  type: string;
  children?: InputTree;
}

type HttpGraphTrigger = Extract<GraphNode, { readonly kind: "trigger" }> & {
  readonly triggerType: "http";
  readonly config: HttpTriggerConfig;
};

function isHttpTrigger(node: ApplicationGraph["nodes"][number]): node is HttpGraphTrigger {
  return node.kind === "trigger" && node.triggerType === "http";
}

function isParameter(value: string): boolean {
  return ["path", "query", "header", "cookie"].includes(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
