## ADDED Requirements

### Requirement: Task domain membership does not expose browser endpoints

Task/job membership SHALL preserve explicit durable identity and its selected/default binding, require the existing domain service boundary and cross-domain import rules, and SHALL not itself grant client access.

#### Scenario: Private job exposed as domain member

- **WHEN** a service exposes a private job descriptor
- **THEN** server callers retain its typed trigger but no browser procedure is generated

## MODIFIED Requirements

### Requirement: Generic services expose original public members
`defineService` SHALL accept optional function, event, task and job maps and expose their original descriptor values as direct typed members without cloning, nested member maps, invocation middleware, or service context.

#### Scenario: Function is exposed
- **WHEN** `createOrder` is supplied as the `createOrder` function member
- **THEN** `orders.createOrder` is referentially equal to `createOrder` and is marked public while unlisted domain functions remain internal
