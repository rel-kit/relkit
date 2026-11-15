import { describe, expect, test } from "bun:test";
import { channelFailure, channelParamsText } from "./channel-answer";

class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("a refused channel connection", () => {
  test("says the application refused or concealed a channel that exists", () => {
    const text = channelFailure(new RpcError("NOT_FOUND", "Channel resource was not found."));
    expect(text).toContain("refused or concealed");
    expect(text).toContain("anonymous visitor without a user session");
    expect(text).not.toContain("this browser");
  });

  test("says that a missing session was refused", () => {
    expect(channelFailure(new RpcError("UNAUTHORIZED", "x"))).toContain("no session");
  });

  test("explains a bare Conflict as a reload since the page loaded (NF-16)", () => {
    expect(channelFailure(new RpcError("CONFLICT", "Conflict"))).toBe(
      "The application reloaded since this page loaded. Try again.",
    );
    expect(channelFailure(new RpcError("CONFLICT", "The client identity changed."))).toBe(
      "The client identity changed.",
    );
  });

  test("keeps the application's message for any other failure", () => {
    expect(channelFailure(new RpcError("INTERNAL", "Channel crashed."))).toBe("Channel crashed.");
    expect(channelFailure("odd")).toBe("Channel operation failed.");
  });
});

describe("the params box", () => {
  test("starts from the declared required parameters", () => {
    expect(
      channelParamsText({
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"],
      }),
    ).toBe('{\n  "companyId": ""\n}');
  });

  test("starts as an empty object when none are declared", () => {
    expect(channelParamsText(undefined)).toBe("{}");
  });
});
