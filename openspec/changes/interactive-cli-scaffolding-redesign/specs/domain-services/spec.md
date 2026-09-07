## ADDED Requirements

### Requirement: Generated domain artifacts preserve ownership and exposure

Scaffolding SHALL place every domain artifact beneath one selected or newly created generic service domain. Generated functions and events SHALL be public by default, while errors, jobs, caches, buckets, tools, prompts, agents, and constants remain internal descriptors unless a declared relationship exposes their behavior. Generic service selection SHALL exclude singleton database and auth services.

#### Scenario: Public function is added

- **WHEN** a function is added to an existing generic service
- **THEN** its original descriptor is exposed directly by that service and no wrapper implementation is generated

#### Scenario: New service is selected from another add command

- **WHEN** an add command resolves `--create-service`
- **THEN** it creates the service and its requested artifact as one transaction without an unrelated sample function

### Requirement: Generated callable relationships are graph-visible

Full and custom bundles SHALL use existing public authoring APIs so declared errors, published events, event-only consumers, jobs, derived tools, agents, prompts, and service routes normalize into the graph with stable domain-qualified identities.

#### Scenario: Full bundle is compiled

- **WHEN** the generated full service bundle passes `relkit check`
- **THEN** the normalized graph contains the public function and event, the function's error and publication, the event consumer, job target, derived tool, agent tool and prompt, and GET service-route target
