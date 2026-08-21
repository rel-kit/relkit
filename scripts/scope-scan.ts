import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
export type ScopeViolation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};
const approvedPackages = new Set(
  "agents app buckets cache cli client-generator cloud-aws compiler config contracts create-zsys deploy deploy-pulumi diagnostics engine events functions graph inspector-api invocation jobs observability openapi providers-local routes runtime-effect runtime-hono schema services supervisor testing tools".split(
    " ",
  ),
);
const approvedApps = new Set(["docs", "inspector"]);
const approvedExamples = new Set(["README.md", "commerce"]);
const approvedTemplates = new Set(["default"]);
const forbiddenNames =
  "persistence|identity|workflow|knowledge(?:-store)?|plugin|marketplace|subscription|entity|relation";
const proseAllowlist = [
  /^AGENTS\.md$/,
  /^docs\/(?:README\.md|briefs\/|records\/|zsys-typescript-poc-(?:technical-spec|review-gates)-v3\.md)/,
  /^openspec\/changes\/implement-zsys-typescript-poc-v3\//,
];
const implementationFiles = new Set(["apps/docs/tsconfig.json", "scripts/scope-scan.ts"]);
const contentExtensions = /\.(?:c|m)?(?:ts|tsx|js|jsx)|\.json$|\.toml$|\.ya?ml$|\.md$/i;
const alternateIac =
  /\b(?:terraform|opentofu|cloudformation|(?:aws-)?cdk|sst|alchemy|serverless|bicep)\b|@cdktf|aws-cdk-lib|arm[-_ ]?template/i;

function isAllowlistedProse(path: string): boolean {
  return proseAllowlist.some((pattern) => pattern.test(path));
}
function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return { line, column };
}
function violation(
  root: string,
  file: string,
  rule: string,
  message: string,
  text?: string,
  offset = 0,
): ScopeViolation {
  const path = relative(root, file).replaceAll("\\", "/");
  const location = text === undefined ? { line: 1, column: 1 } : position(text, offset);
  return { file: path, ...location, rule, message };
}

function pathViolations(root: string, file: string): ScopeViolation[] {
  const path = relative(root, file).replaceAll("\\", "/");
  const parts = path.split("/");
  const findings: ScopeViolation[] = [];
  const add = (rule: string, message: string): void => {
    findings.push(violation(root, file, rule, message));
  };

  if (parts[0] === "packages" && parts[1] && !approvedPackages.has(parts[1])) {
    add("out-of-scope-package", `packages/${parts[1]} is not an approved ZSys package`);
  }
  if (parts[0] === "apps" && parts[1] && !approvedApps.has(parts[1])) {
    add("out-of-scope-package", `apps/${parts[1]} is not an approved ZSys app`);
  }
  if (parts[0] === "examples" && parts[1] && !approvedExamples.has(parts[1])) {
    add("out-of-scope-package", `examples/${parts[1]} is not an approved ZSYS example`);
  }
  if (parts[0] === "templates" && parts[1] && !approvedTemplates.has(parts[1])) {
    add("out-of-scope-template-name", `templates/${parts[1]} is not the approved template root`);
  }
  if (/(?:^|\/)[^/]+\.subscription\.ts$/i.test(path)) {
    add("subscription-source", `separate subscription source file is forbidden: ${path}`);
  }
  if (/(?:^|\/)(?:Cargo\.(?:toml|lock)|rust-toolchain(?:\.toml)?|[^/]+\.rs)$/i.test(path)) {
    add("rust-source", `Rust source or project metadata is forbidden: ${path}`);
  }
  if (
    /(?:^|\/)(?:terraform|opentofu|cloudformation|cdk|sst|alchemy|serverless|bicep)(?:\/|\.|$)/i.test(
      path,
    ) ||
    /\.(?:tf|tf\.json)$/i.test(path)
  ) {
    add("alternate-iac", `alternate infrastructure-engine path or file is forbidden: ${path}`);
  }
  if (["apps", "examples", "templates", "tests"].includes(parts[0] ?? "")) {
    for (const part of parts.slice(1)) {
      const name = part
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase();
      if (new RegExp(`^(?:${forbiddenNames})s?$`, "i").test(name)) {
        add(
          parts[0] === "templates" ? "out-of-scope-template-name" : "out-of-scope-navigation-name",
          `out-of-scope name in ${parts[0]} path: ${part}`,
        );
      }
    }
  }
  return findings;
}

function contentViolations(root: string, file: string): ScopeViolation[] {
  const path = relative(root, file).replaceAll("\\", "/");
  if (isAllowlistedProse(path) || implementationFiles.has(path) || !contentExtensions.test(path)) {
    return [];
  }
  const text = readFileSync(file, "utf8");
  const findings: ScopeViolation[] = [];
  const patterns: Array<[string, RegExp, string]> = [
    [
      "subscription-primitive",
      /\bdefineSubscription\b/g,
      "defineSubscription is not part of the public API",
    ],
    [
      "out-of-scope-api",
      /\b(?:define|create)(?:Persistence|Identity|Workflow|KnowledgeStore|Plugin|Marketplace)\b/g,
      "out-of-scope public API name",
    ],
    [
      "out-of-scope-package",
      new RegExp(`@zsys/(?:${forbiddenNames})(?=[/"'\`]|$)`, "gi"),
      "out-of-scope package name",
    ],
    [
      "out-of-scope-graph-name",
      new RegExp(
        `\\b(?:kind|nodeKind|graphKind|nodeType|resourceType)\\s*[:=]\\s*[\\"'\\x60](?:${forbiddenNames})[\\"'\\x60]`,
        "gi",
      ),
      "out-of-scope graph node name",
    ],
    [
      "out-of-scope-navigation-name",
      new RegExp(`[\\"'\\x60]\\/?(?:${forbiddenNames})s?(?:[/?#][^\\"'\\x60]*)?[\\"'\\x60]`, "gi"),
      "out-of-scope navigation or route name",
    ],
    [
      "out-of-scope-template-name",
      new RegExp(
        `\\b(?:template|templates|preset|variant)\\s*[:=]\\s*[\\"'\\x60](?:${forbiddenNames})[\\"'\\x60]`,
        "gi",
      ),
      "out-of-scope template name",
    ],
  ];
  for (const [rule, pattern, message] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const offset = match.index ?? 0;
      findings.push(violation(root, file, rule, message, text, offset));
    }
  }
  if (alternateIac.test(text)) {
    findings.push(
      violation(
        root,
        file,
        "alternate-iac",
        "alternate infrastructure engine name",
        text,
        text.search(alternateIac),
      ),
    );
  }
  return findings;
}

function filesToScan(root: string): string[] {
  const paths = [
    "package.json",
    "bunfig.toml",
    "turbo.json",
    "tsconfig.json",
    "tsconfig.base.json",
  ];
  for (const directory of "apps examples packages templates scripts tests .github".split(" ")) {
    const absolute = resolve(root, directory);
    if (!existsSync(absolute)) continue;
    paths.push(
      ...[...new Bun.Glob("**/*").scanSync({ cwd: absolute, onlyFiles: true })]
        .filter((path) => !/(^|\/)(dist|node_modules|\.turbo|\.zsys)(\/|$)/.test(path))
        .map((path) => `${directory}/${path}`),
    );
  }
  return [...new Set(paths.map((path) => resolve(root, path)))].sort();
}

export function scanScope(root: string): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  for (const file of filesToScan(root)) {
    if (!existsSync(file)) continue;
    violations.push(...pathViolations(root, file), ...contentViolations(root, file));
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.rule}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.rule}`,
    ),
  );
}
