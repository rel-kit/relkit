/**
 * Owns the optional Scalar renderer. Importing this explicit entrypoint requires
 * @scalar/hono-api-reference@0.12.9; core OpenAPI generation imports no UI SDK.
 * Prepared applications select the same renderer with apiDocs.ui = "scalar".
 */
import { Scalar } from "@scalar/hono-api-reference";
import type { Hono } from "hono";
import type { RegistrationPlan } from "@relkit/graph";
import { installApiDocs } from "./api-docs.js";
import type { ApiDocsOptions, ApiReferenceFactory } from "./api-docs.types.js";

/** Builds Scalar's native handler from authorized URL or embedded document input.
 * @param configuration - Prepared title and document representation.
 * @returns The native Scalar Hono middleware.
 */
export const scalarReference: ApiReferenceFactory = (configuration) => Scalar(configuration);

/** Installs OpenAPI and the optional Scalar UI behind their shared authorization.
 * @param app - Application whose common middleware is already installed.
 * @param plan - Verified registration plan used for document generation.
 * @param options - Existing document exposure and authorization settings.
 * @returns Nothing; invalid configuration rejects before route publication.
 */
export function installScalarApiDocs(
  app: Hono,
  plan: RegistrationPlan,
  options: ApiDocsOptions = {},
): void {
  installApiDocs(app, plan, { ...options, ui: "scalar", reference: scalarReference });
}
