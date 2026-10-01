import type ts from "typescript";
import { routeSourceFindings, routeModuleFindings } from "@relkit/compiler/editor";

const ROUTE_DIAGNOSTIC = 99001;

/** TypeScript language-service plugin; uses the editor's unsaved source snapshots. */
export default function initialize(modules: {
  readonly typescript: typeof ts;
}): ts.server.PluginModule {
  const typescript = modules.typescript;
  return {
    create(info) {
      const service = info.languageService;
      const proxy = Object.create(null) as ts.LanguageService;
      for (const key of Object.keys(service) as (keyof ts.LanguageService)[]) {
        Object.defineProperty(proxy, key, {
          value: (...args: unknown[]) =>
            (service[key] as (...args: unknown[]) => unknown).apply(service, args),
          writable: true,
        });
      }
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
