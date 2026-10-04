import type { JsonValue } from "@relkit/contracts";
import { InspectorEndpointError } from "./router-utils.js";
import { identity, type ResolvedActiveGeneration } from "./shared.js";

/**
 * Validates bounded explorer text, cursor and limit fields.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Only supported native explorer query fields.
 */
export function queryFor(request: Request) {
  const params = new URL(request.url).searchParams;
  const prefix = optionalText(params.get("prefix"), "prefix", 1_024);
  const search = optionalText(params.get("search"), "search", 256);
  const cursor = optionalText(params.get("cursor"), "cursor", 512);
  const limit = integer(params.get("limit"), "limit", 50, 200);
  return {
    limit,
    ...(prefix === undefined ? {} : { prefix }),
    ...(search === undefined ? {} : { search }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

/**
 * Selects the established safe preview representation for the declared media type.
 * @param bytes - Native preview bytes already bounded by the validated request.
 * @param contentType - Declared preview media type after metadata projection.
 * @returns Permitted text/base64 content or metadata-only evidence.
 */
export function previewContent(bytes: Uint8Array, contentType: string) {
  if (contentType === "text/html" || contentType === "image/svg+xml") {
    return { kind: "metadata-only" };
  }
  if (contentType === "application/json" || contentType.startsWith("text/")) {
    return {
      kind: contentType === "application/json" ? "json" : "text",
      content: new TextDecoder().decode(bytes),
    };
  }
  if (contentType === "application/pdf" || /^image\/(png|jpeg|gif|webp)$/.test(contentType)) {
    return {
      kind: contentType === "application/pdf" ? "pdf" : "image",
      content: Buffer.from(bytes).toString("base64"),
    };
  }
  return { kind: "metadata-only" };
}

/**
 * Extracts the declared media type from projected metadata.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A normalized media type or application/octet-stream.
 */
export function mediaType(value: JsonValue): string {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "contentType" in value &&
    typeof value.contentType === "string"
    ? value.contentType.split(";", 1)[0]!.toLowerCase()
    : "application/octet-stream";
}

/**
 * Builds the existing unsupported resource-explorer envelope.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Identity-bearing unsupported evidence with an empty item list.
 */
export function unsupported(generation: ResolvedActiveGeneration): JsonValue {
  return { ...identity(generation), supported: false, reason: "unsupported", items: [] };
}

/**
 * Validates a bounded optional resource selector without supplying a default.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @param max - Maximum accepted size or numeric bound.
 * @returns Accepted text, or undefined when absent.
 */
export function optionalText(value: string | null, name: string, max: number): string | undefined {
  return value === null || value === "" ? undefined : requiredText(value, name, max);
}

/**
 * Validates a required nonempty resource selector against its declared bound.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @param max - Maximum accepted size or numeric bound.
 * @returns Accepted text or the existing public parameter error.
 */
export function requiredText(value: string | null, name: string, max: number): string {
  if (value === null || value === "" || value.length > max)
    throw new InspectorEndpointError(`RELKIT_INSPECTOR_${name.toUpperCase()}_INVALID`, 400);
  return value;
}

/**
 * Validates a numeric request field against its declared range and default.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @param fallback - Default used only when the optional parameter is absent.
 * @param max - Maximum accepted size or numeric bound.
 * @returns A finite accepted integer or the existing parameter error.
 */
export function integer(value: string | null, name: string, fallback: number, max: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) > max)
    throw new InspectorEndpointError(`RELKIT_INSPECTOR_${name.toUpperCase()}_INVALID`, 400);
  return Number(value);
}
