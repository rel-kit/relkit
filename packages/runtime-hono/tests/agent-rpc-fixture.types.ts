/** Names the actual public fixture client, accepted run and loaded snapshot used across RPC scenario helpers; no substitute SDK contracts are introduced. */
import type { createFixtureClient } from "./fixture-client.js";
import type { createEchoRpcFixture } from "./agent-rpc-echo.fixture.js";
import type { createGenerationFixture } from "./agent-generation.fixture.js";
import type { createApprovalFixture } from "./agent-approval.fixture.js";

/** Public client inferred from the actual transport fixture contract. */
export type AgentRpcClient = ReturnType<typeof createFixtureClient>;

/** Accepted-run receipt returned by that public client. */
export type AgentRpcRun = Awaited<ReturnType<AgentRpcClient["relkit.agent.run"]>>;

/** Persisted snapshot returned by the public load operation. */
export type AgentRpcSnapshot = Awaited<ReturnType<AgentRpcClient["relkit.agent.load"]>>;

/** Echo scenario's native clients and live engine observations. */
export type EchoRpcFixture = Awaited<ReturnType<typeof createEchoRpcFixture>>;

/** Retirement scenario's native barriers, clients and live settlement observations. */
export type GenerationFixture = Awaited<ReturnType<typeof createGenerationFixture>>;

/** Approval scenario's native client, descriptor and live execution count. */
export type ApprovalFixture = Awaited<ReturnType<typeof createApprovalFixture>>;
