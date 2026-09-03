export function collectProducerStatus() {
  const producers = new Map<string, { failed: number; dropped: number }>();
  return {
    report: async (request: Request): Promise<Response> => {
      try {
        const value = (await request.json()) as {
          source?: unknown;
          failed?: unknown;
          dropped?: unknown;
        };
        if (
          typeof value.source !== "string" ||
          value.source.length > 128 ||
          !Number.isSafeInteger(value.failed) ||
          Number(value.failed) < 0 ||
          !Number.isSafeInteger(value.dropped) ||
          Number(value.dropped) < 0
        )
          return new Response("Invalid producer status", { status: 400 });
        producers.set(value.source, {
          failed: Number(value.failed),
          dropped: Number(value.dropped),
        });
        return Response.json({ ok: true });
      } catch {
        return new Response("Invalid producer status", { status: 400 });
      }
    },
    snapshot: () =>
      [...producers.values()].reduce(
        (sum, value) => ({
          failed: sum.failed + value.failed,
          dropped: sum.dropped + value.dropped,
        }),
        { failed: 0, dropped: 0 },
      ),
  };
}
