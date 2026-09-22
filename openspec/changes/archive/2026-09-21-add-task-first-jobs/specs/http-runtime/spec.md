## ADDED Requirements

### Requirement: Jobs RPC shares security and transport negotiation

Exposed job procedures SHALL use the existing RPC namespace/transports, identity/session contract and origin/CSRF protections. Name-to-ID dispatch SHALL verify that each run belongs to the selected job and authorized scope. Schema/callback authentication SHALL precede worker or client dispatch. Jobs capability negotiation SHALL reject incompatible protocol/contract versions without replacing existing routes, realtime or agent capabilities.

#### Scenario: Forged operation over alternate transport

- **WHEN** a client manually sends an omitted job operation over HTTP or websocket
- **THEN** both transports reject it before native work

#### Scenario: Stale public fingerprint

- **WHEN** an old client attempts a job write after a name/contract change
- **THEN** the identity/contract precondition fails rather than routing to an unrelated job

#### Scenario: Task input transforms at the RPC boundary

- **WHEN** generated HTTP or websocket job RPC accepts caller input requiring a business transform
- **THEN** transport envelope validation and shared admission apply that transform only once and authorization receives its canonical value

### Requirement: Job watch proxy validates and projects every native frame

The default browser watch SHALL use authorized server-proxied normalized frames. A browser SHALL never receive provider secrets, task handlers, server config, raw private native frames or broad native tokens. Direct-native access, if later certified, SHALL require exact run/job/stream/projection-scoped short-lived credentials and the same watch interface; otherwise proxy remains required.

#### Scenario: Native metadata has secret fields

- **WHEN** a native update includes private input or provider error detail
- **THEN** the proxy validates and projects before serialization and returns only the approved fields
