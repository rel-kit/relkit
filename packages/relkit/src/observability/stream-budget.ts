/** One stream owns at most four MiB of aggregate subscriber backlog. */
export function makeStreamBudget() {
  let bytes = 0;
  return {
    reserve: (size: number) => {
      if (bytes + size > 4_194_304) return false;
      bytes += size;
      return true;
    },
    release: (size: number) => {
      bytes -= size;
    },
    bytes: () => bytes,
  };
}

/** Shared byte accounting belongs to one stream, never a process global. */
export type StreamBudget = ReturnType<typeof makeStreamBudget>;
