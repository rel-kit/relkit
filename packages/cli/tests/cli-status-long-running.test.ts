/** Verifies long-running commands never start a spinner that captures Ctrl+C. */
import { beforeEach, expect, test, vi } from "vitest";

const spinner = vi.fn(() => ({ start: vi.fn(), message: vi.fn(), stop: vi.fn(), error: vi.fn() }));
vi.mock("@clack/prompts", () => ({ spinner }));

const { createCliStatus } = await import("../src/cli-status.js");
const interactive = { tty: true, ci: false };

beforeEach(() => spinner.mockClear());

test.each(["create", "add", "dev", "start", "inspector"])(
  "%s owns the terminal without a spinner",
  (command) => {
    createCliStatus(interactive, false, command).start();
    expect(spinner).not.toHaveBeenCalled();
  },
);

test("finite commands still show a spinner", () => {
  createCliStatus(interactive, false, "build").start();
  expect(spinner).toHaveBeenCalledOnce();
});
