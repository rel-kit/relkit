/** Verifies the editor plugin proxy survives plugins that chain it with object spread. */
import ts from "typescript";
import { expect, test } from "vitest";
import initialize from "../src/editor.js";

function languageService(): ts.LanguageService {
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => ({}),
    getScriptFileNames: () => [],
    getScriptVersion: () => "0",
    getScriptSnapshot: () => undefined,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: () => false,
    readFile: () => undefined,
  };
  return ts.createLanguageService(host);
}

test("forwarded and overridden methods survive object spread by later plugins", () => {
  const service = languageService();
  const proxy = initialize({ typescript: ts }).create({
    languageService: service,
  } as ts.server.PluginCreateInfo);
  const spread = { ...proxy };
  expect(Object.keys(proxy).length).toBe(Object.keys(service).length);
  for (const key of ["getCurrentProgram", "getProgram", "getCompletionsAtPosition"] as const) {
    expect(typeof (spread as Record<string, unknown>)[key]).toBe("function");
  }
  expect(spread.getSemanticDiagnostics).toBe(proxy.getSemanticDiagnostics);
  expect(spread.getCodeFixesAtPosition).toBe(proxy.getCodeFixesAtPosition);
});
