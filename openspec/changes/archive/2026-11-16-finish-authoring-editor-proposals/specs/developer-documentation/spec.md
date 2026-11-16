## ADDED Requirements

### Requirement: Authoring options are described where they are read

Every option that an editor lists for an authoring API SHALL have a one-line description in its type, and the generated API reference SHALL print an option type with its members, including the provider options of `defineApp`.

#### Scenario: Hovering an option

- **WHEN** a developer selects an option of `defineTask` in the editor's suggestion list
- **THEN** the editor shows its description

#### Scenario: Reading the API page

- **WHEN** a developer opens the `ServerConfig` entry of the application API page
- **THEN** the entry lists the members of the type
