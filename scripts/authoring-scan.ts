import * as ts from "typescript";
import { importReferences, isFixtureForbidden } from "./boundary-imports";
import {
  add,
  authoringFragments,
  fullName,
  hasFunction,
  propertyName,
  stringValue,
  type AuthoringViolation,
  type Fragment,
} from "./authoring-scan-utils";

const vendorProfile =
  /^(?:aws|amazon|azure|gcp|google|openai|anthropic|s3|sqs|sns|dynamodb|redis|postgres|mysql|pulumi|hono|effect|next)(?:[./_-].*)?$/i;
const vendorModel =
  /^(?:gpt(?:[-./_].*)?|claude(?:[-./_].*)?|gemini(?:[-./_].*)?|llama(?:[-./_].*)?|mistral(?:[-./_].*)?|command(?:[-./_].*)?|o[134](?:[-./_].*)?)$/i;
const agentProviderProperty =
  /^(?:api[-_]?key|access[-_]?key|client|credential(?:s)?|endpoint|model(?:id|name)|provider|sdk|secret(?:key)?|token)$/i;
const forbiddenSymbols =
  /\b(?:Effect|Layer|Context\.Tag|Schema\.Schema|Fiber|Cause|Hono|Next(?:JS|\.js)?|Pulumi|(?:S3|DynamoDB|Redis|CloudWatch|EventBridge|SQS|ECS|RDS)Client|ProviderClient|CloudClient)\b/g;
const valueReads =
  /\b(?:process\.env|Bun\.env|Deno\.env|import\.meta\.env|Bun\.file|(?:readFile|readFileSync|readTextFile))\b/g;
const clientConstruction = /(?:Client|Provider|Redis|DynamoDB|S3|Hono|Pulumi)$/i;
const registrationCall =
  /^(?:register(?:[A-Z].*)?|listen|serve|start|startServer|createServer|mount|setInterval|setTimeout)$/i;

function scanCall(
  root: string,
  fragment: Fragment,
  source: ts.SourceFile,
  call: ts.CallExpression,
  depth: number,
  findings: AuthoringViolation[],
): void {
  const name = fullName(call.expression);
  const shortName = name.split(".").at(-1) ?? "";
  const options = call.arguments[0];
  if (
    options &&
    ts.isObjectLiteralExpression(options) &&
    (/^define[A-Z]/.test(shortName) || shortName === "onEvent")
  ) {
    for (const member of options.properties) {
      if (!ts.isPropertyAssignment(member)) continue;
      const key = propertyName(member.name);
      if (
        key === "handler" &&
        shortName !== "defineFunction" &&
        shortName !== "defineServiceMiddleware"
      )
        add(
          root,
          fragment,
          findings,
          "non-function-handler",
          `${shortName} cannot own a handler`,
          member.getStart(source),
        );
      if (
        (key === "request" || key === "mapping" || key === "decision") &&
        hasFunction(member.initializer)
      )
        add(
          root,
          fragment,
          findings,
          "arbitrary-mapping-closure",
          `${key} mappings must be serializable`,
          member.initializer.getStart(source),
        );
      if (
        (key === "profile" || key === "model") &&
        [vendorProfile, vendorModel].some((pattern) =>
          pattern.test(stringValue(member.initializer) ?? ""),
        )
      )
        add(
          root,
          fragment,
          findings,
          "vendor-profile-name",
          `${key} must describe logical intent, not a vendor`,
          member.initializer.getStart(source),
        );
      if (shortName === "defineAgent" && agentProviderProperty.test(key ?? ""))
        add(
          root,
          fragment,
          findings,
          "agent-provider-details",
          `${key} belongs in global provider configuration, not an agent descriptor`,
          member.name.getStart(source),
        );
    }
  }
  if (name.startsWith("http.") && call.arguments.some(hasFunction))
    add(
      root,
      fragment,
      findings,
      "arbitrary-mapping-closure",
      "HTTP mappings must be serializable",
      call.getStart(source),
    );
  if (
    depth === 0 &&
    (registrationCall.test(shortName) ||
      shortName === "use" ||
      (shortName === "push" && /(?:registry|descriptors|routes)$/i.test(name)))
  )
    add(
      root,
      fragment,
      findings,
      "registration-side-effect",
      `${shortName} is registration/startup work`,
      call.getStart(source),
    );
}

function scanFragment(root: string, fragment: Fragment): AuthoringViolation[] {
  const source = ts.createSourceFile(
    fragment.path,
    fragment.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: AuthoringViolation[] = [];
  for (const reference of importReferences(source)) {
    if (
      isFixtureForbidden(reference.specifier) ||
      /^(?:effect|hono|next|pulumi|aws-sdk|fs|node:fs(?:\/promises)?|node:process|dotenv|@(?:effect|hono|next|pulumi|aws-sdk|azure|google-cloud|cloudflare)\/)/.test(
        reference.specifier,
      )
    )
      add(
        root,
        fragment,
        findings,
        "framework-leak",
        `forbidden framework/cloud import "${reference.specifier}"`,
        reference.position,
      );
  }
  for (const pattern of [forbiddenSymbols, valueReads]) {
    pattern.lastIndex = 0;
    for (const match of fragment.text.matchAll(pattern))
      add(
        root,
        fragment,
        findings,
        pattern === valueReads ? "value-read" : "framework-leak",
        pattern === valueReads
          ? "descriptor code reads a process/file value"
          : `forbidden framework/client symbol "${match[0]}"`,
        match.index ?? 0,
      );
  }
  const visit = (node: ts.Node, depth: number): void => {
    if (ts.isCallExpression(node)) scanCall(root, fragment, source, node, depth, findings);
    if (ts.isNewExpression(node) && clientConstruction.test(fullName(node.expression)))
      add(
        root,
        fragment,
        findings,
        "client-construction",
        "provider/client construction is not authoring metadata",
        node.getStart(source),
      );
    if (ts.isIdentifier(node) && node.text === "globalThis")
      add(
        root,
        fragment,
        findings,
        "registration-side-effect",
        "global registration state is forbidden",
        node.getStart(source),
      );
    ts.forEachChild(node, (child) => visit(child, depth + (ts.isFunctionLike(node) ? 1 : 0)));
  };
  visit(source, 0);
  return findings;
}

export function scanAuthoring(root: string): AuthoringViolation[] {
  return authoringFragments(root)
    .flatMap((fragment) => scanFragment(root, fragment))
    .sort((left, right) =>
      `${left.file}:${left.line}:${left.column}:${left.rule}`.localeCompare(
        `${right.file}:${right.line}:${right.column}:${right.rule}`,
      ),
    );
}
