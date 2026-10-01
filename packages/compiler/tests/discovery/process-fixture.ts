import type { EvaluatorProcess } from "../../src/discovery/evaluator-process.js";
import type { ProcessFixtureOptions } from "./process-fixture.types.js";

/**
 * Supplies controllable capabilities without starting an operating-system child.
 * @param options - Exit, input, and output behavior controlled by each test.
 * @returns A process plus observed writes, signals, and reader cancellations.
 */
export function makeProcess(options: ProcessFixtureOptions = {}) {
  let exitCode: number | null = null;
  let complete = (_code: number): void => {};
  const exited = new Promise<number>((resolve) => {
    complete = (code) => {
      exitCode = code;
      resolve(code);
    };
  });
  const writes: string[] = [];
  const signals: string[] = [];
  const cancellations: string[] = [];
  const stdout = output("out", cancellations, options.pendingOutput, options.outputError);
  const stderr = output("err", cancellations, options.pendingOutput);
  const process: EvaluatorProcess = {
    stdin: {
      /**
       * Records input before running the optional test hook.
       * @param value - Serialized evaluator request.
       * @returns The controlled byte count or Promise from the test hook.
       */
      write: (value) => {
        writes.push(value);
        return options.write?.() ?? value.length;
      },

      /**
       * Applies the test's selected exit and output-failure behavior.
       * @returns Nothing after completing the selected transitions.
       */
      end: () => {
        if (options.completeOnEnd) complete(0);
        if (options.afterExitError) stdout.fail(options.afterExitError);
      },
    },
    stdout: stdout.stream,
    stderr: stderr.stream,
    exited,
    get exitCode() {
      return exitCode;
    },

    /**
     * Records forced termination, resolves exit, and closes remaining pipes.
     * @param signal - Requested termination signal.
     * @returns Nothing after settling the fixture's lifetime.
     */
    kill: (signal) => {
      signals.push(signal);
      complete(137);
      stdout.close();
      stderr.close();
    },
  };
  return {
    process,
    writes,
    signals,
    cancellations,
    failStdout: stdout.fail,
    failStderr: stderr.fail,
  };
}

/**
 * Builds an output pipe that can remain pending until the test terminates it.
 * @param value - Initial output bytes before closing or waiting.
 * @param cancellations - Shared observation list for stream cancellation.
 * @param pending - Whether to keep the pipe open for controlled finalization.
 * @param error - Optional initial read failure.
 * @returns The stream and operations to fail or close its controller once.
 */
function output(value: string, cancellations: string[], pending = false, error?: Error) {
  let terminal = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (current) => {
      controller = current;
      if (error !== undefined) {
        terminal = true;
        current.error(error);
      } else {
        current.enqueue(new TextEncoder().encode(value));
        if (!pending) {
          terminal = true;
          current.close();
        }
      }
    },
    cancel: () => {
      terminal = true;
      cancellations.push(value);
    },
  });
  return {
    stream,

    /**
     * Closes this pipe once unless it already failed or was canceled.
     * @returns Nothing after making the controller terminal.
     */
    close: () => {
      if (!terminal) {
        terminal = true;
        controller.close();
      }
    },

    /**
     * Rejects pending readers with the supplied failure once.
     * @param cause - Reader failure to expose through the transport adapter.
     * @returns Nothing after making the controller terminal.
     */
    fail: (cause: Error) => {
      if (!terminal) {
        terminal = true;
        controller.error(cause);
      }
    },
  };
}
