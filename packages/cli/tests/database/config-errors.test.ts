/** A failing Drizzle configuration is reported with its own, sanitized, reason. */
import { expect, test } from "bun:test";
import { app, migrate, write } from "./fixture.js";

test("a configuration that throws shows its own message with an environment hint", async () => {
  const root = await app();
  await write(
    root,
    "drizzle.config.ts",
    'if (!process.env.RELKIT_G08_UNSET) throw new Error("Set DATABASE_URL to the database you intend to migrate");\nexport default {};\n',
  );
  const result = await migrate(root);
  expect(result.code).toBe(2);
  expect(result.result.error.code).toBe("RELKIT_DB_CONFIG");
  expect(result.result.error.message).toContain(
    "Set DATABASE_URL to the database you intend to migrate",
  );
  expect(result.result.error.message).toContain(".env");
  expect(result.result.error.message).not.toContain("installed dependencies");
});

test("credentials in a thrown message are masked", async () => {
  const root = await app();
  await write(
    root,
    "drizzle.config.ts",
    'throw new Error("Cannot reach postgres://owner:hunter2@db.internal:5432/app (password=hunter2)");\n',
  );
  const result = await migrate(root);
  const message: string = result.result.error.message;
  expect(message).toContain("db.internal:5432/app");
  expect(message).not.toContain("hunter2");
  expect(message).not.toContain("owner:");
});

test("a password containing an at sign is masked whole", async () => {
  const root = await app();
  await write(
    root,
    "drizzle.config.ts",
    'throw new Error("Cannot reach postgres://owner:hunt@er2@db.internal:5432/app");\n',
  );
  const result = await migrate(root);
  const message: string = result.result.error.message;
  expect(message).toContain("postgres://***@db.internal:5432/app");
  expect(message).not.toContain("er2");
});

test("a configuration importing a missing package keeps the dependency hint", async () => {
  const root = await app();
  await write(
    root,
    "drizzle.config.ts",
    'import "relkit-g08-not-installed";\nexport default {};\n',
  );
  const result = await migrate(root);
  expect(result.code).toBe(2);
  expect(result.result.error.code).toBe("RELKIT_DB_CONFIG");
  expect(result.result.error.message).toContain("relkit-g08-not-installed");
  expect(result.result.error.message).toContain("Install");
  expect(result.result.error.message).not.toContain(root);
});
