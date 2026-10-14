/** Precise native resource identity projection retained by the Pulumi mock registration callback. */
import type { NativeMockResource } from "./grouped-pulumi.schemas.js";

/** Immutable type/name identity registered by the real engine. */
export type RegisteredMockResource = typeof NativeMockResource.Type;
