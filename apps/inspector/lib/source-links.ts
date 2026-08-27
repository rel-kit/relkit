export type SourceEditor = "cursor" | "vscode" | "webstorm";
export type InspectorSourceMode = "development" | "production" | "test";

export interface ProjectSource {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface SourceLinkConfig {
  readonly mode: InspectorSourceMode;
  readonly editor?: SourceEditor;
  readonly backendUrl?: string;
}

export function projectSource(value: unknown): ProjectSource | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.file !== "string") return undefined;
  const line = source.line;
  const column = source.column;
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column)) return undefined;
  if ((line as number) < 1 || (column as number) < 1) return undefined;
  const file = relativeFile(source.file);
  return file === undefined ? undefined : { file, line: line as number, column: column as number };
}

export function sourceLabel(value: unknown): string {
  const source = projectSource(value);
  return source === undefined
    ? "Source unavailable"
    : `${source.file}:${source.line}:${source.column}`;
}

export function sourceLink(
  value: unknown,
  config: SourceLinkConfig = configuredSourceLinks(),
): string | undefined {
  const source = projectSource(value);
  const editor = readEditor(config.editor);
  if (source === undefined || config.mode !== "development" || editor === undefined)
    return undefined;
  if (!isLocalBackend(config.backendUrl)) return undefined;
  const path = source.file.split("/").map(encodeURIComponent).join("/");
  const position = `${source.line}:${source.column}`;
  if (editor === "vscode") return `vscode://file/${path}:${position}`;
  if (editor === "cursor") return `cursor://file/${path}:${position}`;
  return `jetbrains://idea/navigate/reference?path=${encodeURIComponent(source.file)}&line=${source.line}&column=${source.column}`;
}

export function configuredSourceLinks(): SourceLinkConfig {
  const editor = readEditor(
    process.env.NEXT_PUBLIC_RELKIT_SOURCE_EDITOR ?? process.env.NEXT_PUBLIC_RELKIT_EDITOR,
  );
  return {
    mode: process.env.NODE_ENV === "development" ? "development" : "production",
    ...(editor === undefined ? {} : { editor }),
    ...(process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL === undefined
      ? {}
      : { backendUrl: process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL }),
  };
}

function readEditor(value: unknown): SourceEditor | undefined {
  return value === "cursor" || value === "vscode" || value === "webstorm" ? value : undefined;
}

function isLocalBackend(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function relativeFile(value: string): string | undefined {
  const file = value.replaceAll("\\", "/");
  if (file === "" || file.startsWith("/") || /^[A-Za-z]:\//.test(file)) return undefined;
  const segments: string[] = [];
  for (const segment of file.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." || segment.includes(":")) return undefined;
    segments.push(segment);
  }
  return segments.length === 0 ? undefined : segments.join("/");
}
