import { runExecutionSync } from "@relkit/contracts/operation";
import { ManagedRuntime } from "effect";
import { ClientStreams, ClientStreamsLive } from "./stream.service.js";

// No native work is acquired by this browser-wide service owner.
export const streamRuntime = ManagedRuntime.make(ClientStreamsLive);
/** Once-acquired stream service whose call fibers own all native requests. */
export const clientStreams = runExecutionSync(streamRuntime, ClientStreams);
