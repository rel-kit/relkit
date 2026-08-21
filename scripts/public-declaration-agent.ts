import * as ts from "typescript";

const declarations = new Set(["AgentDescriptor", "DefineAgentOptions"]);
const providerProperties = new Set([
  "apiKey",
  "api_key",
  "accessKey",
  "access_key",
  "client",
  "credential",
  "credentials",
  "endpoint",
  "modelId",
  "modelName",
  "provider",
  "sdk",
  "secret",
  "secretKey",
  "token",
]);

/** Finds vendor/provider fields added directly to public agent option types. */
export function agentProviderPropertyOffsets(file: string, text: string): readonly number[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const offsets: number[] = [];
  const visit = (node: ts.Node): void => {
    const name = declarationName(node);
    if (name !== undefined && declarations.has(name)) {
      for (const member of members(node)) {
        if (ts.isPropertySignature(member) && providerProperties.has(member.name.getText(source)))
          offsets.push(member.getStart(source));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offsets;
}

function declarationName(node: ts.Node): string | undefined {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
    ? node.name.text
    : undefined;
}

function members(node: ts.Node): readonly ts.Node[] {
  if (ts.isInterfaceDeclaration(node)) return node.members;
  return ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)
    ? node.type.members
    : [];
}
