## ADDED Requirements

### Requirement: Fresh installs carry no known advisory from RelKit's pins

A project created from the current packages SHALL install without a known moderate or higher advisory that reaches it through a version RelKit pins or scaffolds.

#### Scenario: Audit of a fresh npm install

- **WHEN** `npm audit` runs in a newly created project with authentication and a database
- **THEN** no advisory is attributed to a RelKit package or to a version RelKit wrote into the manifest
