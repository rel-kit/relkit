import { Command, END, START, isCommand } from "@langchain/langgraph";
import { normalizeId } from "@relkit/contracts";
import { validate, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import { isRecord } from "./agent-validation.js";
import type { GraphNodeAny, GraphNodeResult } from "./define-graph-node.js";

export function assertGraphNodeDestinations(
  node: Pick<GraphNodeAny, "id" | "ends">,
  registeredNodeIds: ReadonlySet<string> | readonly string[],
): void {
  const registered =
    registeredNodeIds instanceof Set ? registeredNodeIds : new Set(registeredNodeIds);
  for (const destination of node.ends) {
    if (destination !== END && !registered.has(destination)) {
      throw new TypeError(`Graph node "${node.id}" declares unknown destination "${destination}"`);
    }
  }
}

export function copyGraphNodeEnds(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError("Graph node ends must be an array");
  const ends = value.map((entry) => {
    if (entry === START) throw new TypeError("Graph node ends cannot contain START");
    return entry === END ? END : normalizeId(entry);
  });
  if (new Set(ends).size !== ends.length) {
    throw new TypeError("Graph node ends must be unique");
  }
  return Object.freeze(ends);
}

export async function validateGraphNodeResult<
  OutputSchema extends StandardSchemaV1,
  Ends extends readonly string[],
>(output: OutputSchema, ends: Ends, result: unknown): Promise<GraphNodeResult<OutputSchema, Ends>> {
  if (!isCommand(result)) return validatedUpdate(output, result);
  if (result.goto !== undefined && result.graph !== Command.PARENT) {
    validateDestinations(ends, result.goto);
  }
  if (result.update !== undefined) {
    result.update = await validatedUpdate(output, commandUpdate(result.update));
  }
  return result as GraphNodeResult<OutputSchema, Ends>;
}

export async function validatedGraphNodeInput<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
): Promise<InferOutput<Schema>> {
  return validatedValue(schema, value, "input");
}

function validateDestinations(ends: readonly string[], value: unknown): void {
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    const destination =
      typeof entry === "string"
        ? entry
        : isRecord(entry) && typeof entry.node === "string"
          ? entry.node
          : undefined;
    if (destination === undefined) {
      throw new TypeError("Graph node command contains an invalid destination");
    }
    if (!ends.includes(destination)) {
      throw new TypeError(
        `Graph node command destination "${destination}" is not declared in ends`,
      );
    }
  }
}

function commandUpdate(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (
    !value.every(
      (entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string",
    )
  ) {
    throw new TypeError("Graph node command contains an invalid update");
  }
  return Object.fromEntries(value.map((entry) => [entry[0], entry[1]]));
}

async function validatedUpdate<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
): Promise<Extract<InferOutput<Schema>, Record<string, unknown>>> {
  const projected = await validatedValue(schema, value, "output");
  if (!isRecord(projected)) throw new TypeError("Graph node output must be an object");
  return projected as Extract<InferOutput<Schema>, Record<string, unknown>>;
}

async function validatedValue<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
  phase: "input" | "output",
): Promise<InferOutput<Schema>> {
  const result = await validate(schema, value as never);
  if (!("value" in result)) {
    const detail = result.issues[0]?.message;
    throw new TypeError(
      `Graph node ${phase} validation failed${detail === undefined ? "" : `: ${detail}`}`,
    );
  }
  return result.value;
}
