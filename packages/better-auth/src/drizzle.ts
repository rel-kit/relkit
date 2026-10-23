/** Native Better Auth borrowing the selected Drizzle owner's lifetime and admission. */
export { defineBetterAuthService, BETTER_AUTH_HANDLER } from "./index.js";
export { activateBetterAuthService } from "./activation.js";
export { generateBetterAuthOpenApi } from "./openapi.js";
export { AuthFailure } from "./auth.errors.js";
export { AuthFactory, authFactoryLiveLayer } from "./auth.factory.js";
export { AuthService, authServiceLayer, authLiveLayer } from "./auth.service.js";
export type { BetterAuthActivationOptions } from "./activation.types.js";
export type {
  BetterAuthServiceOptions,
  BetterAuthRegistration,
  BetterAuthHandler,
  InferBetterAuthSession,
  BetterAuthServiceDescriptor,
  AuthConfiguration,
  AuthServiceInterface,
  AuthFactoryInterface,
} from "./auth.types.js";
