/** Splits an owned acceptance fixture's unchanged native configuration into explicit Platform fragments without registration or autoloading. */
import * as ts from "typescript";

const providerKeys = new Set(["bucket", "cache", "realtime", "agent-state", "jobs", "defaults"]);

/**
 * Retains every original native property expression while changing only its explicit configuration placement.
 * @param text - Complete original commerce configuration.
 * @returns Root source and ordinary Platform fragments, including an intentionally unimported failure sentinel.
 */
export function commercePlatformFragments(text: string) {
  const source = ts.createSourceFile("relkit.config.ts", text, ts.ScriptTarget.Latest, true);
  const exported = source.statements.find(ts.isExportAssignment);
  if (!exported || !ts.isCallExpression(exported.expression))
    throw new Error("Missing native commerce configuration");
  const argument = exported.expression.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument))
    throw new Error("Missing native configuration object");
  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((node) => node.getText(source))
    .join("\n");
  const fragments: Record<string, string> = {};
  const retained: string[] = [],
    providers: string[] = [];
  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      retained.push(property.getText(source));
      continue;
    }
    if (!ts.isPropertyAssignment(property))
      throw new Error("Unexpected native configuration property");
    const name = property.name.getText(source).replaceAll('"', "");
    if (providerKeys.has(name)) providers.push(property.getText(source));
    else if (["server", "inspector", "telemetry", "deployment"].includes(name))
      fragments[`src/platform/config/${name}.ts`] =
        `/** Explicit native ${name} configuration; importing this value acquires no runtime client. */\n${imports}\nexport default ${property.initializer.getText(source)} as const;\n`;
    else retained.push(property.getText(source));
  }
  fragments["src/platform/config/providers.ts"] =
    `/** Explicit native provider metadata without activation. */\n${imports}\nexport default {${providers.join(",\n")}} as const;\n`;
  fragments["src/platform/config/unused.ts"] =
    '/** Ordinary unimported Platform source must never be automatically evaluated. */\nthrow new Error("Unused Platform fragment was automatically loaded");\nexport {};\n';
  const names = ["server", "inspector", "telemetry", "deployment", "providers"];
  const root = `${imports}\nimport { localEvent } from "@relkit/local";\n${names.map((name) => `import ${name} from "./src/platform/config/${name}.js";`).join("\n")}\nexport default defineApp({${retained.join(",\n")}, server, inspector, telemetry, deployment, ...providers, event: localEvent(), defaults: {...providers.defaults, event: "default"}});\n`;
  return { root, fragments };
}
