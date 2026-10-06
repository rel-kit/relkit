import type ts from "typescript";
import { routeSourceFindings, routeModuleFindings } from "@relkit/compiler/editor";
import type { EditorModules } from "./editor.types.js";

const ROUTE_DIAGNOSTIC = 99001;

/** Creates the synchronous editor plugin using the editor's own TypeScript instance.
 * @param modules - Editor-provided TypeScript implementation.
 * @returns A plugin factory reading current unsaved source snapshots.
 * @remarks TypeScript's CommonJS plugin loader invokes this synchronously. The host owns
 * language-service disposal; these pure hooks acquire no resources or Effect runtime.
 */
export default function initialize(modules: EditorModules): ts.server.PluginModule {
  const typescript = modules.typescript;
  return {
    /** Adds RELKIT findings and fixes while forwarding all other host methods.
     * @param info - Host language service and plugin context.
     * @returns A synchronous proxy backed by the existing language service.
     */
    create(info) {
      const service = info.languageService;
      // The host LanguageService contract consists of methods. Fill its own method
      // keys before overriding the two hooks, preserving `this` on forwarded calls.
      const proxy = Object.create(null) as ts.LanguageService;
      for (const key of Object.keys(service) as (keyof ts.LanguageService)[]) {
        Object.defineProperty(proxy, key, {
          value: (...args: unknown[]) =>
            (service[key] as (...args: unknown[]) => unknown).apply(service, args),
          writable: true,
        });
      }
      /** Reads current host snapshots and appends route findings.
       * @param file - Source file requested by the editor.
       * @returns Host diagnostics followed by RELKIT diagnostics, or just host results
       * when the file or current program is unavailable.
       */
      proxy.getSemanticDiagnostics = (file) => {
        const diagnostics = service.getSemanticDiagnostics(file);
        const program = service.getProgram();
        const source = program?.getSourceFile(file);
        if (!program || !source) return diagnostics;
        return [
          ...diagnostics,
          ...[
            ...routeSourceFindings(source, typescript),
            ...routeModuleFindings(program, source, typescript),
          ].map(({ node, message }) => ({
            file: source,
            start: node.getStart(source),
            length: node.getWidth(source),
            category: typescript.DiagnosticCategory.Error,
            code: ROUTE_DIAGNOSTIC,
            source: "relkit",
            messageText: message,
          })),
        ];
      };
      /** Adds the destructuring fix only for an overlapping RELKIT finding.
       * @param file - Requested source file.
       * @param start - Start of the editor selection.
       * @param end - End of the editor selection.
       * @param codes - Diagnostic codes selected for fixing.
       * @param format - Host formatting options passed through unchanged.
       * @param preferences - Host code-fix preferences passed through unchanged.
       * @returns Existing host fixes followed by applicable RELKIT fixes.
       */
      proxy.getCodeFixesAtPosition = (file, start, end, codes, format, preferences) => {
        const fixes = service.getCodeFixesAtPosition(file, start, end, codes, format, preferences);
        if (!codes.includes(ROUTE_DIAGNOSTIC)) return fixes;
        const source = service.getProgram()?.getSourceFile(file);
        if (!source) return fixes;
        return [
          ...fixes,
          ...routeSourceFindings(source, typescript).flatMap(({ node, replacement }) =>
            replacement && node.getStart(source) < end && node.end > start
              ? [
                  {
                    fixName: "relkit-destructure-service-routes",
                    description: "Destructure the HTTP method from the service route table",
                    changes: [
                      {
                        fileName: file,
                        textChanges: [
                          {
                            span: { start: node.getStart(source), length: node.getWidth(source) },
                            newText: replacement,
                          },
                        ],
                      },
                    ],
                  },
                ]
              : [],
          ),
        ];
      };
      return proxy;
    },
  };
}
