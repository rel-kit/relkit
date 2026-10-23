/** Registers the retained deepagent-bucket scenarios in their original order with cohesive case fixtures. */
import { describe, test } from "bun:test";
import { case1Bucket, case2Bucket } from "./deepagent-bucket.bucket.cases.js";
describe("DeepAgents bucket compilation", () => {
  test("declares the bucket on the agent and its generated function", case1Bucket);
  test("rejects a RELKIT cache descriptor as a filesystem backend", case2Bucket);
});
