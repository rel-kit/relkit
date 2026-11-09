# Spec Delta

## Purpose

Defines the public kit that lets people outside the core team write RelKit providers and adapters that
behave like first-party ones.

## ADDED Requirements

### Requirement: Provider author guide and starter

RelKit SHALL publish a provider-author guide and a starter package that builds, tests and packs a
working provider.

#### Scenario: Starter passes

- **WHEN** an author creates a provider from the starter and runs its tests
- **THEN** the tests pass and the packed provider installs into a RelKit app

### Requirement: Public conformance suites

The jobs, events, cache, buckets and realtime conformance suites, including failure injection, SHALL be
published through `@relkit/testing` for provider authors.

#### Scenario: Third-party cache provider

- **WHEN** an author runs the cache conformance suite against their provider
- **THEN** it reports pass or fail per case, using the same cases as first-party providers

### Requirement: Same approach for adapters

Runtime, deploy-target and agent adapters SHALL be specified by public interfaces with conformance
suites, in the same way as providers.

#### Scenario: Agent adapter conformance

- **WHEN** an author writes a new agent adapter
- **THEN** they can run the shared agent conformance suite against it

### Requirement: Stable provider contract

The provider contract that the kit documents SHALL be Core and SHALL follow the stability policy.

#### Scenario: Provider contract change after 1.0

- **WHEN** the provider contract changes incompatibly after 1.0
- **THEN** the change ships only in a major release with a migration
