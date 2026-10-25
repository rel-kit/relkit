/** Checks Blume's expanded search documents, excluding references while retaining authored API usage. */
import { resolve } from "node:path";
import { scanProject } from "blume/core/project-graph.ts";
import { buildSearchDocuments } from "blume/search/documents.ts";
import { Effect } from "effect";
import config from "../blume.config.js";

await Effect.runPromise(
  Effect.tryPromise(async () => {
    const project = await scanProject(resolve(import.meta.dir, ".."), { mode: "build" });
    const documents = await buildSearchDocuments(project);
    for (const document of documents) {
      if (/^\/docs\/api(?:\/|$)/.test(document.route))
        throw new Error(`Reference page must stay out of search: ${document.route}`);
      if (!document.title.trim() || !document.description.trim())
        throw new Error(`Search metadata is missing: ${document.route}`);
    }
    const corpus = documents
      .map(({ title, description, content }) => `${title}\n${description}\n${content}`)
      .join("\n");
    for (const term of [
      "defineRoute",
      "defineEventFunction",
      "relkit add route",
      "defineAgent",
      "defineBucket",
      "defineConstants",
      "definePrompt",
      "RelkitClientProvider",
      "Call your API from React",
      "useJobTrigger",
      "useChannel",
      "useRelkitClient",
      "defineProviderAdapter",
      "createTestBucketFake",
      "normalizeCreateOptions",
      "@relkit/client/server",
      "Scalar",
    ]) {
      if (!corpus.includes(term)) throw new Error(`Search corpus is missing: ${term}`);
    }
    if (
      !config.search ||
      !("indexing" in config.search) ||
      config.search.indexing?.includeCodeBlocks !== true
    ) {
      throw new Error("Native search must index code symbols and commands.");
    }
    console.log(
      `Validated ${documents.length} searchable documents with all reference pages excluded.`,
    );
  }),
);
