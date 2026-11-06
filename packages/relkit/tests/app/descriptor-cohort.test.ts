import { expect, test } from "vitest";
import { defineEnv } from "../../src/config/index.js";
import { defineApp } from "../../src/app/define-app.js";
import { defineConstants, definePrompt } from "../../src/app/context-descriptors.js";

test("application and context descriptors retain distinct kinds", () => {
  expect(defineApp({ env: defineEnv({}) }).kind).toBe("app");
  expect(defineConstants({ region: "eu" }).kind).toBe("constants");
  expect(definePrompt("Help").kind).toBe("prompt");
});
