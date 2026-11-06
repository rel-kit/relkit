import { expect, it } from "vitest";
import { createTestHttpClient } from "../../src/http.js";

const echo = {
  request: async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    return Response.json({
      method: request.method,
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    });
  },
};

interface Echo {
  readonly method: string;
  readonly contentType: string | null;
  readonly body: string;
}

it("serializes the json shorthand and types the response body", async () => {
  const http = createTestHttpClient(echo);
  try {
    const response = await http.post<Echo, { name: string }>("/hello", { json: { name: "Ada" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ name: "Ada" }),
    });
  } finally {
    await http.close();
  }
});

it("keeps an explicit content type and rejects json combined with body", async () => {
  const http = createTestHttpClient(echo);
  try {
    const typed = await http.put<Echo>("/hello", {
      json: [1],
      headers: { "content-type": "application/vnd.test+json" },
    });
    expect((await typed.json()).contentType).toBe("application/vnd.test+json");
    await expect(http.patch("/hello", { json: {}, body: "x" })).rejects.toThrow(
      "either json or body, not both",
    );
  } finally {
    await http.close();
  }
});
