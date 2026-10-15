/** Release packing commands retain diagnostics and join their owned process group on timeout. */
import { expect, test } from "bun:test";
import { command } from "../release-check-support.js";

test("release commands return stdout and preserve nonzero-exit diagnostics", async () => {
  expect(await command(process.execPath, ["-e", 'console.log("complete")'])).toBe("complete\n");
  await expect(
    command(process.execPath, ["-e", 'console.error("packing failed");process.exit(7)']),
  ).rejects.toThrow("packing failed");
});

test("release command deadlines terminate and join the owned process group", async () => {
  let message = "";
  try {
    await command(
      process.execPath,
      ["-e", 'console.log(process.pid);console.error("stalled install");setInterval(()=>{},100)'],
      process.cwd(),
      1_000,
    );
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain("timed out after 1000ms");
  expect(message).toContain("stalled install");
  const pid = Number(message.split("\n")[1]);
  expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(-pid, 0)).toThrow();
});
