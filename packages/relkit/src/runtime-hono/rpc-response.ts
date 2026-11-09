/** The RPC endpoint's answer for a procedure it does not serve, in oRPC 1.x's error format.
 * @returns A 404 response whose body the oRPC client reads as `NOT_FOUND`.
 * @example rpcNotFound().status; // 404
 */
export function rpcNotFound(): Response {
  return Response.json(
    {
      json: {
        defined: false,
        code: "NOT_FOUND",
        status: 404,
        message: "Not Found",
      },
    },
    { status: 404 },
  );
}
