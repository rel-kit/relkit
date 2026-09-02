## ADDED Requirements

### Requirement: Domain service migration is documented and executable
Documentation SHALL teach the domain-first layout, generic and specialized service APIs, service-aligned routes, public/internal Inspector behavior, and a complete migration from removed layer-first, middleware, data-model, and Better Auth adapter forms.

#### Scenario: Existing application is migrated
- **WHEN** a developer follows the breaking-change migration guide
- **THEN** its imports, directory moves, service facade, database/auth setup, checks, and runtime behavior match the released APIs and canonical examples

