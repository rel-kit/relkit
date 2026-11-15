/**
 * Drives TypeScript's language service the way an editor does: completions at a cursor, the
 * diagnostics of a file and the hover text, over one project with one file's text replaced in
 * memory. TypeScript 5.9 is used through its JavaScript API.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type * as TypeScript from "typescript";

/** One suggestion list as an editor shows it. */
export interface Suggestions {
  /** Entry names in display order, without surrounding quotes. */
  readonly names: readonly string[];
  /** True when the list is the global scope: every value and type in reach, not a known set. */
  readonly global: boolean;
}

/** One error an editor underlines. */
export interface EditorDiagnostic {
  /** 1-based line of the underlined text. */
  readonly line: number;
  /** The underlined text. */
  readonly text: string;
  readonly code: number;
  readonly message: string;
}

/** What the tests and the survey ask of an editor. */
export interface EditorDriver {
  readonly version: string;
  completions(file: string, text: string, offset: number): Promise<Suggestions>;
  diagnostics(file: string, text: string): Promise<readonly EditorDiagnostic[]>;
  hover(file: string, text: string, offset: number): Promise<string>;
  /** Names suggested at a position, each with whether the editor shows a description for it. */
  describe(
    file: string,
    text: string,
    offset: number,
  ): Promise<readonly { readonly name: string; readonly documented: boolean }[]>;
  read(file: string): string;
  close(): Promise<void>;
}

/** Options of {@link createLanguageServiceDriver}. */
export interface DriverOptions {
  /** Absolute path of the project's `tsconfig.json`. */
  readonly project: string;
  /** Directory whose `node_modules` holds the TypeScript 5.9 package to load. */
  readonly typescriptFrom: string;
}

/**
 * Starts a language service for one project.
 * @param options - Project file and TypeScript location.
 * @returns A driver whose calls replace one file's text in memory.
 */
export function createLanguageServiceDriver(options: DriverOptions): EditorDriver {
  const ts = createRequire(join(options.typescriptFrom, "package.json"))(
    "typescript",
  ) as typeof TypeScript;
  const system = ts.sys;
  const parsed = ts.getParsedCommandLineOfConfigFile(
    options.project,
    {},
    { ...system, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  if (parsed === undefined) throw new Error(`Cannot read ${options.project}`);
  const settings = parsed.options;
  const overrides = new Map<string, { readonly text: string; readonly version: number }>();
  let version = 0;
  const host: TypeScript.LanguageServiceHost = {
    getScriptFileNames: () => [...new Set([...parsed.fileNames, ...overrides.keys()])],
    getScriptVersion: (name) => String(overrides.get(name)?.version ?? 0),
    getScriptSnapshot: (name) => {
      const text = overrides.get(name)?.text ?? system.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => dirname(options.project),
    getCompilationSettings: () => settings,
    getDefaultLibFileName: (compilerOptions) => ts.getDefaultLibFilePath(compilerOptions),
    fileExists: system.fileExists,
    readFile: system.readFile,
    readDirectory: system.readDirectory,
    directoryExists: system.directoryExists,
    getDirectories: system.getDirectories,
    // Bun links packages into place, so their own imports resolve from the real location.
    ...(system.realpath === undefined ? {} : { realpath: system.realpath }),
  };
  const service = ts.createLanguageService(host);
  const open = (file: string, text: string): void => {
    if (overrides.get(file)?.text === text) return;
    overrides.clear();
    overrides.set(file, { text, version: ++version });
  };
  return {
    version: ts.version,
    read: (file) => {
      const text = system.readFile(file);
      if (text === undefined) throw new Error(`Cannot read ${file}`);
      return text;
    },
    completions: async (file, text, offset) => {
      open(file, text);
      const result = service.getCompletionsAtPosition(file, offset, {
        includeCompletionsForModuleExports: false,
        includeCompletionsWithInsertText: true,
      });
      const entries = [...(result?.entries ?? [])].sort((left, right) =>
        left.sortText.localeCompare(right.sortText),
      );
      return {
        names: entries.map((entry) => entry.name.replace(/^["']|["']$/gu, "")),
        global: result?.isGlobalCompletion === true,
      };
    },
    diagnostics: async (file, text) => {
      open(file, text);
      const source = service.getProgram()?.getSourceFile(file);
      return [
        ...service.getSyntacticDiagnostics(file),
        ...service.getSemanticDiagnostics(file),
      ].map((diagnostic) => ({
        line:
          source === undefined || diagnostic.start === undefined
            ? 0
            : source.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
        text: text.slice(diagnostic.start ?? 0, (diagnostic.start ?? 0) + (diagnostic.length ?? 0)),
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      }));
    },
    hover: async (file, text, offset) => {
      open(file, text);
      const info = service.getQuickInfoAtPosition(file, offset);
      return info === undefined
        ? ""
        : `${ts.displayPartsToString(info.displayParts)}${info.documentation?.length ? `\n${ts.displayPartsToString(info.documentation)}` : ""}`;
    },
    describe: async (file, text, offset) => {
      open(file, text);
      const result = service.getCompletionsAtPosition(file, offset, {
        includeCompletionsForModuleExports: false,
      });
      if (result === undefined || result.isGlobalCompletion) return [];
      return result.entries.map((entry) => {
        const details = service.getCompletionEntryDetails(
          file,
          offset,
          entry.name,
          undefined,
          entry.source,
          undefined,
          entry.data,
        );
        return {
          name: entry.name.replace(/^["']|["']$/gu, ""),
          documented: (details?.documentation?.length ?? 0) > 0,
        };
      });
    },
    close: async () => service.dispose(),
  };
}
