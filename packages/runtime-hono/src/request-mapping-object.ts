import { MISSING, type BodyState, type Missing } from "./request-mapping-body.js";
import type {
  MappingRequest,
  RequestIssueCode,
  RequestMappingIssue,
  RequestMappingOptions,
} from "./request-mapping.js";

export interface MappingState {
  readonly request: MappingRequest;
  readonly body: BodyState;
  readonly options: RequestMappingOptions;
  readonly issues: RequestMappingIssue[];
  readonly reported: Set<string>;
}
type Path = readonly (string | number)[];
type Visit = (node: unknown, state: MappingState, path: Path) => Promise<unknown | Missing>;

export async function mapObject(
  fields: unknown,
  state: MappingState,
  path: Path,
  visit: Visit,
  report: (code: RequestIssueCode, message: string, path: Path) => void,
): Promise<unknown> {
  if (!isRecord(fields)) {
    report("mapping", "Mapping fields must be an object", path);
    return MISSING;
  }
  const result: Record<string, unknown> = {};
  for (const [name, node] of Object.entries(fields)) {
    const valuePath = [...path, name];
    const value = await visit(node, state, valuePath);
    if (value === MISSING) {
      if (!state.issues.some((issue) => samePath(issue.path, valuePath)))
        report("missing", `Missing request value "${name}"`, valuePath);
    } else result[name] = value;
  }
  return result;
}

function samePath(left: Path, right: Path): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
