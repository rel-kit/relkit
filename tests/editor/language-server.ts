/**
 * Drives TypeScript 7's language server (`tsc --lsp --stdio`) with the calls an editor makes:
 * open a file with its text, ask for completions, diagnostics and hover. TypeScript 7 has no
 * JavaScript language service, so this is the only way to see what its editor support shows.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EditorDiagnostic, EditorDriver, Suggestions } from "./language-service.js";

interface Message {
  readonly id?: number;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

interface Position {
  readonly line: number;
  readonly character: number;
}

/** Names that are in every global suggestion list and in no list of known members. */
const GLOBAL_MARKERS = ["globalThis", "undefined"];

/** Converts a character offset into the line and UTF-16 column the protocol uses. */
function positionAt(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

/**
 * Starts TypeScript 7's language server for one project directory.
 * @param options - Project directory, and the directory whose `node_modules` holds TypeScript 7.
 * @returns A driver; `close` ends the server process.
 */
export async function createLanguageServerDriver(options: {
  readonly projectDirectory: string;
  readonly typescriptFrom: string;
}): Promise<EditorDriver> {
  const require = createRequire(join(options.typescriptFrom, "package.json"));
  const manifest = require.resolve("typescript/package.json");
  const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
  const child = spawn(process.execPath, [join(dirname(manifest), "bin/tsc"), "--lsp", "--stdio"], {
    cwd: options.projectDirectory,
    stdio: ["pipe", "pipe", "ignore"],
  });
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const waiting = new Map<number, (message: Message) => void>();
  const send = (message: object): void => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = Number(
        /Content-Length: (\d+)/iu.exec(buffer.subarray(0, headerEnd).toString())?.[1],
      );
      if (buffer.length < headerEnd + 4 + length) return;
      const message = JSON.parse(
        buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString(),
      ) as Message;
      buffer = buffer.subarray(headerEnd + 4 + length);
      if (message.id !== undefined && message.method === undefined) {
        waiting.get(message.id)?.(message);
        waiting.delete(message.id);
      } else if (message.id !== undefined) {
        // A request from the server, such as a configuration read: answer with nothing.
        send({ id: message.id, result: null });
      }
    }
  });
  const request = <Result>(method: string, params: unknown): Promise<Result> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, (message) =>
        message.error === undefined
          ? resolve(message.result as Result)
          : reject(new Error(`${method}: ${message.error.message}`)),
      );
      send({ id, method, params });
    });
  const rootUri = pathToFileURL(options.projectDirectory).href;
  await request("initialize", {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: "project" }],
    capabilities: { textDocument: { completion: {}, diagnostic: {}, hover: {} } },
  });
  send({ method: "initialized", params: {} });
  const versions = new Map<string, { version: number; text: string }>();
  const open = (file: string, text: string): string => {
    const uri = pathToFileURL(file).href;
    const known = versions.get(uri);
    if (known === undefined) {
      versions.set(uri, { version: 1, text });
      send({
        method: "textDocument/didOpen",
        params: { textDocument: { uri, languageId: "typescript", version: 1, text } },
      });
    } else if (known.text !== text) {
      const next = known.version + 1;
      versions.set(uri, { version: next, text });
      send({
        method: "textDocument/didChange",
        params: { textDocument: { uri, version: next }, contentChanges: [{ text }] },
      });
    }
    return uri;
  };
  type Item = {
    readonly label: string;
    readonly sortText?: string;
    readonly documentation?: unknown;
  };
  const items = async (file: string, text: string, offset: number): Promise<Item[]> => {
    const uri = open(file, text);
    const result = await request<{ items?: Item[] } | Item[] | null>("textDocument/completion", {
      textDocument: { uri },
      position: positionAt(text, offset),
    });
    const list = Array.isArray(result) ? result : (result?.items ?? []);
    return [...list].sort((left, right) =>
      (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label),
    );
  };
  const name = (label: string): string => label.replace(/\?$/u, "").replace(/^["']|["']$/gu, "");
  return {
    version,
    read: (file) => readFileSync(file, "utf8"),
    completions: async (file, text, offset): Promise<Suggestions> => {
      const names = (await items(file, text, offset)).map((item) => name(item.label));
      return { names, global: GLOBAL_MARKERS.every((marker) => names.includes(marker)) };
    },
    describe: async (file, text, offset) =>
      (await items(file, text, offset)).map((item) => ({
        name: name(item.label),
        documented: item.documentation !== undefined && item.documentation !== "",
      })),
    diagnostics: async (file, text): Promise<readonly EditorDiagnostic[]> => {
      const uri = open(file, text);
      const report = await request<{
        items?: {
          range: { start: Position; end: Position };
          severity?: number;
          code?: number;
          message: string;
        }[];
      }>("textDocument/diagnostic", { textDocument: { uri } });
      const lines = text.split("\n");
      // Severity 1 is an error; hints such as a deprecation are not what the survey counts.
      const errors = (report.items ?? []).filter((item) => (item.severity ?? 1) === 1);
      return errors.map((item) => ({
        line: item.range.start.line + 1,
        text:
          item.range.start.line === item.range.end.line
            ? (lines[item.range.start.line] ?? "").slice(
                item.range.start.character,
                item.range.end.character,
              )
            : (lines[item.range.start.line] ?? "").slice(item.range.start.character),
        code: Number(item.code ?? 0),
        message: item.message,
      }));
    },
    hover: async (file, text, offset) => {
      const uri = open(file, text);
      const result = await request<{ contents?: { value?: string } | string } | null>(
        "textDocument/hover",
        { textDocument: { uri }, position: positionAt(text, offset) },
      );
      const contents = result?.contents;
      return typeof contents === "string" ? contents : (contents?.value ?? "");
    },
    close: async () => {
      await request("shutdown", null).catch(() => undefined);
      send({ method: "exit", params: null });
      child.kill();
    },
  };
}
