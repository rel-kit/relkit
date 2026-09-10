import { ORPCError } from "@orpc/server";

export async function requireClientAuthorization(
  authorize: () => boolean | PromiseLike<boolean>,
  resource: "agent" | "channel",
  timeoutMs = 10_000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Authorization timed out.")), timeoutMs);
    });
    if ((await Promise.race([Promise.resolve().then(authorize), timeout])) === true) return;
  } catch {
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  throw new ORPCError("NOT_FOUND", {
    message: `${resource === "agent" ? "Agent" : "Channel"} resource was not found.`,
  });
}
