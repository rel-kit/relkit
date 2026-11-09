/** Keeps the plain Inspector bridge interfaces equal to the schemas that validate them. */
import type { Schema } from "effect";
import { expectTypeOf, it } from "vitest";
import type {
  InspectorConfigurationInputSchema,
  InspectorConfigurationSchema,
} from "../../src/contracts/inspector-config.schemas.js";
import type {
  InspectorConfiguration,
  InspectorConfigurationInput,
} from "../../src/contracts/inspector-config.types.js";

it("matches the authored and resolved bridge schemas", () => {
  expectTypeOf<InspectorConfigurationInput>().toEqualTypeOf<
    Schema.Schema.Type<typeof InspectorConfigurationInputSchema>
  >();
  expectTypeOf<InspectorConfiguration>().toEqualTypeOf<
    Schema.Schema.Type<typeof InspectorConfigurationSchema>
  >();
});
