import { describe, expect, it } from "vitest";
import { lineSink } from "../../src/commands/start-process.service.js";
import { serverOutput } from "../../src/command-start.js";
import type { CliCommandContext } from "../../src/main-support.js";

/** Writes the chunks through a line sink and returns the lines it passed on. */
async function lines(chunks: readonly string[]): Promise<string[]> {
  const received: string[] = [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  await stream.pipeTo(lineSink((line) => received.push(line)));
  return received;
}

describe("relkit start server output", () => {
  it("splits chunks into lines and keeps a last line with no newline", async () => {
    expect(await lines(["first\nsec", "ond\r\nthird"])).toEqual(["first", "second", "third"]);
  });

  it("joins a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode("café\n");
    const received: string[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 4));
        controller.enqueue(bytes.slice(4));
        controller.close();
      },
    });
    await stream.pipeTo(lineSink((line) => received.push(line)));
    expect(received).toEqual(["café"]);
  });

  it("keeps stdout machine-readable in JSON mode", () => {
    const stdout = (_line: string) => undefined;
    const stderr = (_line: string) => undefined;
    const context = { json: false, io: { stdout, stderr } } as unknown as CliCommandContext;
    expect(serverOutput(context)).toEqual({ stdout, stderr });
    expect(serverOutput({ ...context, json: true })).toEqual({ stdout: stderr, stderr });
    expect(serverOutput({ ...context, io: undefined } as CliCommandContext)).toBeUndefined();
  });
});
