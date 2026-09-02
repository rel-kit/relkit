## ADDED Requirements

### Requirement: Domain-first services have layered release evidence
Release verification SHALL cover service identity and typing, domain discovery and boundaries, graph/manifest contracts, Drizzle and Better Auth lifecycle, route protection order, Inspector presentation, generated templates, canonical examples, documentation, and migration diagnostics without cloud credentials or paid calls.

#### Scenario: Breaking release is verified
- **WHEN** focused and full repository verification run against migrated source and legacy fixtures
- **THEN** new domain applications pass, legacy patterns fail with actionable diagnostics, runtime resources drain safely, and generated artifacts contain no live values or secrets

