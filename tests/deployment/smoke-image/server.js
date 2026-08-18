const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const prefix = "/__zsys/aws-smoke/";
const operations = new Set(["job", "event", "bucket", "cache", "logs"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/_zsys/v1/health/live" || url.pathname === "/_zsys/v1/health/ready")
      return json({ ok: true });

    const operation = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
    if (request.method !== "POST" || !operations.has(operation)) return json({ ok: false }, 404);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "JSON body required" }, 400);
    }
    const marker = body?.marker;
    if (typeof marker !== "string" || marker.length === 0)
      return json({ ok: false, error: "marker required" }, 400);

    console.log(JSON.stringify({ event: "zsys.aws.smoke", marker, operation }));
    return json({ ok: true, operation, marker });
  },
});

console.log(`zsys smoke service listening on ${server.hostname}:${server.port}`);
