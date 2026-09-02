## ADDED Requirements

### Requirement: Domain-first source authoring
Application descriptors SHALL be recursively discovered beneath `src/<domain>`, with deterministic domain-prefixed source identities and one service composition point, while routes and platform configuration remain in their reserved layers.

#### Scenario: Source identity is omitted
- **WHEN** `src/orders/functions/create-order.function.ts` omits its ID
- **THEN** its ID is `orders.create-order` regardless of project root or discovery order

### Requirement: Service and integration factories are immutable public descriptors
The public API SHALL provide `defineService`, `defineServiceRoutes`, `defineDrizzleService`, `defineModel`, and `defineBetterAuthService` with inferred immutable types and SHALL reject removed service middleware, eager data-model, and Better Auth adapter forms.

#### Scenario: Removed authoring API is used
- **WHEN** application source uses `defineServiceMiddleware`, `defineDataModel`, or `betterAuthAdapter`
- **THEN** type checking or compilation fails and migration documentation identifies the replacement

