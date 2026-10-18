const items = new Map([[0, { id: 0, title: "Zero" }], [1, { id: 1, title: "One" }]]);

export async function GET(request: Request): Promise<Response> {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id || !items.has(id)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(items.get(id));
}
