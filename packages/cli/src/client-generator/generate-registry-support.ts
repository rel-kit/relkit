import { makeGeneratorOperation } from "./generator-operation.js";
import { Effect } from "effect";
import { observeGenerator, runGenerator } from "./generator-observability.js";
import { agentContractCalculations } from "./generate-agent-contract-types.js";
import { agentContractMetadataEffect } from "./generate-agent-contract-validation.js";
import { recordCalculation } from "./generate-schema-render.js";
import {
  arrayRecordsCore,
  channelDocumentTypeCore,
  publicAgentsCore,
  publicChannelsCore,
  selectorCore,
} from "./generate-registry-support-calculations.js";
/** Delegates serialized agent metadata to the shared contract renderer.
 * @param agent - Serialized public agent metadata.
 * @returns An Effect yielding its contract type or InvalidClientContract.
 * @example Effect.runSync(agentDocumentTypeCore({ id: "assistant" }));
 */
function agentDocumentTypeCore(agent: Record<string, unknown>) {
  return Effect.gen(function* () {
    const clientContract = yield* agentContractMetadataEffect(
      agent.clientContract,
      `agents[${JSON.stringify(agent.id)}].clientContract`,
    );
    return yield* agentContractCalculations.type({
      ...agent,
      ...(clientContract === undefined ? {} : { clientContract }),
    });
  });
}
/** Checks whether an unknown value is a plain record for document decoding.
 * @param value - Untrusted document value.
 * @returns An Effect with a boolean and no expected failures.
 * @example Effect.runSync(isRecordEffect({ id: "orders.get" }));
 */
export const isRecordEffect = Effect.fn("clientGenerator.isRecord")((value: unknown) =>
  observeGenerator(
    "isRecord",
    Effect.map(recordCalculation(value), (record) => record !== undefined),
  ),
);
/** Synchronous record type guard for document compatibility.
 * @param value - Untrusted document value.
 * @returns Whether the value is a non-array object.
 * @throws If the synchronous Effect runtime defects.
 * @example isRecord({ id: "orders.get" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return runGenerator(isRecordEffect(value));
}
const channelDocumentTypeOperation = makeGeneratorOperation(
  "channelDocumentType",
  channelDocumentTypeCore,
);
/** Renders a channel contract from serialized metadata in an observed Effect.
 * @param channel - Serialized channel metadata with events and presence.
 * @returns An Effect with the generated value or InvalidClientContract.
 * @example Effect.runSync(channelDocumentTypeEffect(channel));
 */
export const channelDocumentTypeEffect = channelDocumentTypeOperation.effect;
/** Renders a channel contract from serialized metadata synchronously for existing callers.
 * @param channel - Serialized channel metadata with events and presence.
 * @returns The generated value.
 * @throws InvalidClientContract for malformed client metadata.
 * @example channelDocumentType(channel);
 */
export const channelDocumentType = channelDocumentTypeOperation.run;
const agentDocumentTypeOperation = makeGeneratorOperation(
  "agentDocumentType",
  agentDocumentTypeCore,
);
/** Renders an agent contract from serialized metadata in an observed Effect.
 * @param agent - Serialized agent metadata and client contract.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(agentDocumentTypeEffect(agent));
 */
export const agentDocumentTypeEffect = agentDocumentTypeOperation.effect;
/** Renders an agent contract from serialized metadata synchronously for existing callers.
 * @param agent - Serialized agent metadata and client contract.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example agentDocumentType(agent);
 */
export const agentDocumentType = agentDocumentTypeOperation.run;
const arrayRecordsOperation = makeGeneratorOperation("arrayRecords", arrayRecordsCore);
/** Filters an unknown list to record values in an observed Effect.
 * @param value - Document or schema value to render.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(arrayRecordsEffect(value));
 */
export const arrayRecordsEffect = arrayRecordsOperation.effect;
/** Filters an unknown list to record values synchronously for existing callers.
 * @param value - Document or schema value to render.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example arrayRecords(value);
 */
export const arrayRecords = arrayRecordsOperation.run;
const publicChannelsOperation = makeGeneratorOperation("publicChannels", publicChannelsCore);
/** Selects channels exposed to client code in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(publicChannelsEffect(graph));
 */
export const publicChannelsEffect = publicChannelsOperation.effect;
/** Selects channels exposed to client code synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example publicChannels(graph);
 */
export const publicChannels = publicChannelsOperation.run;
const publicAgentsOperation = makeGeneratorOperation("publicAgents", publicAgentsCore);
/** Selects agents exposed to client code in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(publicAgentsEffect(graph));
 */
export const publicAgentsEffect = publicAgentsOperation.effect;
/** Selects agents exposed to client code synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example publicAgents(graph);
 */
export const publicAgents = publicAgentsOperation.run;
const selectorOperation = makeGeneratorOperation("selector", selectorCore);
/** Formats the method and path selector for a route in an observed Effect.
 * @param route - Resolved HTTP route.
 * @returns An Effect with the generated value and no expected typed failures.
 * @example Effect.runSync(selectorEffect(route));
 */
export const selectorEffect = selectorOperation.effect;
/** Formats the method and path selector for a route synchronously for existing callers.
 * @param route - Resolved HTTP route.
 * @returns The generated value.
 * @throws If malformed trusted input causes a defect.
 * @example selector(route);
 */
export const selector = selectorOperation.run;
/** Registry helper calculations, including an Effect for agent contracts. @internal */
export const registrySupportCalculations = {
  channelDocument: channelDocumentTypeOperation.run,
  channelDocumentEffect: channelDocumentTypeCore,
  agentDocument: agentDocumentTypeCore,
  records: arrayRecordsOperation.run,
  recordsEffect: arrayRecordsCore,
  channels: publicChannelsOperation.run,
  channelsEffect: publicChannelsCore,
  agents: publicAgentsOperation.run,
  agentsEffect: publicAgentsCore,
  selector: selectorOperation.run,
  selectorEffect: selectorCore,
} as const;
