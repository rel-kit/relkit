import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { users, memberships } from "@app/database/schema/index.js";

test("rejects empty and in-memory migration targets", async () => {
  for (const path of ["", ":memory:"]) {
    const child = Bun.spawn([process.execPath, "drizzle.config.ts"], {
      cwd: resolve(import.meta.dir, ".."),
      env: { ...process.env, DATABASE_PATH: path },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).not.toBe(0);
    expect(stderr).toContain("Set DATABASE_PATH to the persistent SQLite file");
  }
});

test("applies the initial migration once and keeps rows on a second run", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-database-migrations-"));
  const path = join(root, "test.sqlite");
  try {
    for (let run = 0; run < 2; run++) {
      const child = Bun.spawn([process.execPath, "run", "db:migrate"], {
        cwd: resolve(import.meta.dir, ".."),
        env: { ...process.env, DATABASE_PATH: path },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) throw new Error(`Migration failed: ${stdout}\n${stderr}`);
      expect(stdout).toContain("migrations applied successfully");
      const sqlite = new Database(path);
      try {
        const database = drizzle({ client: sqlite });
        if (run === 0) {
          const [user] = await database
            .insert(users)
            .values({ email: "one@example.com" })
            .returning();
          await database.insert(memberships).values({
            organizationId: "org",
            userId: user!.id,
            role: "owner",
          });
        }
        expect(await database.select().from(users)).toMatchObject([
          { email: "one@example.com", active: true },
        ]);
        expect(await database.select().from(memberships)).toMatchObject([{ role: "owner" }]);
      } finally {
        sqlite.close();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
