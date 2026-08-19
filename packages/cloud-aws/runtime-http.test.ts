import { expect, test } from "bun:test";
import { awsRequest } from "./src/runtime/http.ts";

test("signs product requests with ECS task-role credentials", async () => {
  const previous = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = "/v2/credentials/test";
  const requests: string[] = [];
  try {
    const response = await awsRequest("https://sqs.us-east-1.amazonaws.com", {
      service: "sqs",
      region: "us-east-1",
      fetch: async (url, init) => {
        requests.push(String(url));
        if (String(url).startsWith("http://169.254.170.2/"))
          return Response.json({
            AccessKeyId: "test-access-key",
            SecretAccessKey: "test-secret-key",
            Token: "test-session-token",
            Expiration: new Date(Date.now() + 300_000).toISOString(),
          });
        expect(new Headers(init?.headers).get("authorization")).toContain(
          "Credential=test-access-key/",
        );
        expect(new Headers(init?.headers).get("x-amz-security-token")).toBe("test-session-token");
        return new Response("ok");
      },
    });
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
  } finally {
    if (previous === undefined) delete process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    else process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = previous;
  }
});
