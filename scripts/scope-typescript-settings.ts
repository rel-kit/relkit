import ts from "typescript";

/** Compiler tooling settings are distinct from product navigation names. */
export function isTypeScriptPluginSetting(path: string, text: string, offset: number): boolean {
  if (!/(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path)) return false;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.JSON, true, ts.ScriptKind.JSON);
  let setting = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getStart(source) === offset &&
      ts.isStringLiteral(node.name) &&
      node.name.text === "plugins"
    ) {
      const owner = node.parent.parent;
      setting =
        ts.isPropertyAssignment(owner) &&
        ts.isStringLiteral(owner.name) &&
        owner.name.text === "compilerOptions";
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return setting;
}
