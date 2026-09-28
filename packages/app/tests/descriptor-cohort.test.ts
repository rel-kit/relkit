import { expect, test } from "vitest";
import { defineEnv } from "@relkit/config";
import { defineApp } from "../src/define-app.js";
import { defineConstants, definePrompt } from "../src/context-descriptors.js";

test("application and context descriptors retain distinct kinds", () => {
  expect(defineApp({ env: defineEnv({}) }).kind).toBe("app");
  expect(defineConstants({ region: "eu" }).kind).toBe("constants");
  expect(definePrompt("Help").kind).toBe("prompt");
});
