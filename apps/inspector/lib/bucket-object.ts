import type { InspectorBucketObject } from "./api-types";

/** Content types a file extension names. Only extensions whose type is not in doubt are listed. */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  png: ["image/png"],
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  pdf: ["application/pdf"],
  json: ["application/json"],
  txt: ["text/plain"],
  csv: ["text/csv"],
  html: ["text/html"],
  css: ["text/css"],
  js: ["text/javascript", "application/javascript"],
  xml: ["application/xml", "text/xml"],
  zip: ["application/zip", "application/x-zip-compressed"],
  gz: ["application/gzip", "application/x-gzip"],
};

/** A content type that says nothing about the file, so it cannot contradict the key. */
const GENERIC = new Set(["application/octet-stream", "binary/octet-stream"]);

/**
 * Whether an object's stored content type contradicts the extension of its key.
 * @param key - The object's key.
 * @param contentType - The content type stored with the object, when the provider reports one.
 * @returns The extension and the stored type when they disagree; nothing when they agree, when
 * the type is generic, or when the extension says nothing certain.
 */
export function contentTypeConflict(
  key: string,
  contentType: string | undefined,
): { readonly extension: string; readonly contentType: string } | undefined {
  if (contentType === undefined || contentType.trim() === "") return undefined;
  const file = key.slice(key.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const extension = file.slice(dot + 1).toLowerCase();
  const expected = EXPECTED[extension];
  if (expected === undefined) return undefined;
  const base = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (base === "" || GENERIC.has(base) || expected.includes(base)) return undefined;
  return { extension: `.${extension}`, contentType };
}

export interface ObjectFacts {
  readonly size?: number;
  readonly contentType?: string;
  readonly lastModified?: string;
}

/** The size, content type and modified time a bucket listing reports for one object. */
export function objectFacts(item: InspectorBucketObject): ObjectFacts {
  const size =
    typeof item.size === "number"
      ? item.size
      : typeof item.metadata?.size === "number"
        ? item.metadata.size
        : undefined;
  const contentType =
    typeof item.metadata?.contentType === "string" && item.metadata.contentType !== ""
      ? item.metadata.contentType
      : undefined;
  return {
    ...(size === undefined ? {} : { size }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(typeof item.lastModified === "string" && item.lastModified !== ""
      ? { lastModified: item.lastModified }
      : {}),
  };
}

/** Whether base64 content decodes to something that starts like a PDF file. */
export function isPdfContent(base64: string): boolean {
  try {
    return atob(base64.slice(0, 16)).startsWith("%PDF-");
  } catch {
    return false;
  }
}
