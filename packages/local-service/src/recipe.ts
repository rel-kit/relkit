/** Version used by composite recipes; single-container recipes remain on v1. */
export const LOCAL_SERVICE_RECIPE_PROTOCOL_VERSION = 2 as const;

export type * from "./recipe.types.js";
export type * from "./recipe-runtime.types.js";
