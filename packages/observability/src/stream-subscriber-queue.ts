/** Count and byte reservations are released on every dequeue, eviction and close. */
import type { ObservabilityStreamEvent, ObservabilityStreamOverflow } from "./stream-types.js";
import type { StreamBudget } from "./stream-budget.js";

/** Pure bounded queue; false requests disconnection under the chosen overflow policy. */
export function makeSubscriberQueue(
  limit: number,
  overflow: ObservabilityStreamOverflow,
  budget: StreamBudget,
  onDrop: () => void,
) {
  const entries: { event: ObservabilityStreamEvent; bytes: number }[] = [];
  let bytes = 0;
  const shift = () => {
    const entry = entries.shift();
    if (entry) {
      bytes -= entry.bytes;
      budget.release(entry.bytes);
    }
    return entry?.event;
  };
  return {
    shift,
    clear: () => {
      budget.release(bytes);
      bytes = 0;
      entries.length = 0;
    },
    length: () => entries.length,
    bytes: () => bytes,
    put: (event: ObservabilityStreamEvent) => {
      const size = new TextEncoder().encode(JSON.stringify(event)).byteLength;
      while (true) {
        if (entries.length < limit && bytes + size <= 1_048_576 && budget.reserve(size)) {
          entries.push({ event, bytes: size });
          bytes += size;
          return true;
        }
        onDrop();
        if (overflow === "disconnect") return false;
        if (overflow === "drop-newest" || entries.length === 0 || size > 1_048_576) return true;
        shift();
      }
    },
  };
}
