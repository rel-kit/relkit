/**
 * Implements Bun's complete fetch shape while keeping requests under fixture control.
 * @param handler Handles requests made by the subject under test.
 * @returns A fetch function with an inert preconnect implementation.
 */
export function mockFetch(
  handler: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: () => undefined });
}
