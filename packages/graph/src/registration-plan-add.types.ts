import type { RegistrationPlan } from "./registration-plan.types.js";

/** Mutable projection accumulated while constructing a registration plan.
 * @remarks Only the planner mutates this shape; the public result is deeply frozen.
 * @example function append(plan: MutableRegistrationPlan): void { plan.functions.sort(); }
 */
export type MutableRegistrationPlan = {
  -readonly [Key in keyof RegistrationPlan]-?: NonNullable<
    RegistrationPlan[Key]
  > extends readonly (infer Item)[]
    ? Item[]
    : NonNullable<RegistrationPlan[Key]>;
};
