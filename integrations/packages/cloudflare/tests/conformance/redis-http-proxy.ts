/**
 * A minimal Redis REST endpoint for tests: it answers the Upstash-compatible protocol the HTTP
 * client speaks (`POST /` with `[command, ...args]`, answered with `{ result }` or `{ error }`) by
 * forwarding each command to a real Redis server over Bun's socket client.
 */

/** A running proxy. */
export interface RedisHttpProxy {
  /** `http://:<token>@127.0.0.1:<port>`, the URL an HTTP Redis client takes. */
  readonly url: string;
  readonly stop: () => Promise<void>;
}

/**
 * Starts the proxy in front of one Redis server.
 * @param redisUrl - `redis://` URL of the server.
 * @param token - Bearer token the proxy requires.
 * @returns The proxy's client URL and its stop function.
 */
export async function startRedisHttpProxy(
  redisUrl: string,
  token: string,
): Promise<RedisHttpProxy> {
  const redis = new Bun.RedisClient(redisUrl, { autoReconnect: true });
  await redis.connect();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.headers.get("authorization") !== `Bearer ${token}`)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      const [command, ...args] = (await request.json()) as unknown[];
      try {
        const result = await redis.send(String(command), args.map(String));
        return Response.json({ result: result ?? null });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400 },
        );
      }
    },
  });
  return {
    url: `http://:${token}@127.0.0.1:${server.port}`,
    stop: async () => {
      await server.stop(true);
      redis.close();
    },
  };
}
