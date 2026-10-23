/** Finite public import exercises for retained generic benchmark installations. */
export const retainedBoundaryFixtures = [
  {
    name: "creator-only",
    development: true,
    source: `
import { isValidPackageName } from "create-relkit";
if (!isValidPackageName("boundary-probe")) throw new Error("Creator validation failed");
console.log("creator-public-entry");
`,
  },
  {
    name: "wrapper-only",
    development: true,
    source: `
import { resolveProjectCli } from "relkit";
if (typeof resolveProjectCli !== "function") throw new Error("Wrapper public export missing");
console.log("wrapper-public-entry");
`,
  },
  ...["minimal-development", "api-development", "production-only"].map((name) => ({
    name,
    development: name !== "production-only",
    source: `
import { defineService } from "@relkit/app";
if (typeof defineService !== "function") throw new Error("Application authoring export missing");
console.log("application-public-entry");
`,
  })),
  {
    name: "generic-server-client",
    development: true,
    source: `
import { createClient } from "@relkit/client";
import { createServerClient } from "@relkit/client/server";
const client = createClient({ baseUrl: "http://127.0.0.1:1" });
const server = createServerClient({ baseUrl: "http://127.0.0.1:1" });
if (client == null || server == null) throw new Error("Client public export missing");
console.log("client-public-entry");
`,
  },
  {
    name: "general-testing",
    development: true,
    source: `
import { createTestRuntime, createTestApplication } from "@relkit/testing";
if (typeof createTestRuntime !== "function" || typeof createTestApplication !== "function") throw new Error("Testing public export missing");
console.log("testing-public-entry");
`,
  },
] as const;
