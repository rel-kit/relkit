/** Registers the unchanged real packed CLI external-project acceptance. */
import { test } from "bun:test";
import { verifyInstalledCliCreation } from "./installed-cli-create.cases.js";

test(
  "normal CLI installs external projects from packed packages without contributor links",
  () => verifyInstalledCliCreation(),
  360_000,
);
