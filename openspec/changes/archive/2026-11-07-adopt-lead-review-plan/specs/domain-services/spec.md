# Spec Delta

## MODIFIED Requirements

### Requirement: Service route maps are typed and explicit

`defineServiceRoutes` SHALL map each configured function-route HTTP method to a public function of one
service using shorthand or full route options, and a route module SHALL be able to export the map
directly without destructuring. `ALL` SHALL remain exclusive to raw handlers.

#### Scenario: Several methods share a route file

- **WHEN** a route module exports one service route map with `GET` and `POST` without destructuring
- **THEN** both compile to the same route contracts as individual `defineRoute` declarations and
  retain their selected public member types

### Requirement: Better Auth service uses the application database and route mount

`defineBetterAuthService({ auth })` SHALL accept a Better Auth instance that the application creates
with `betterAuth()`. When the instance sets no database, RelKit SHALL supply the default Drizzle
service at activation; when it sets one, RelKit SHALL use it unchanged. RelKit SHALL serve the handler
at the instance's base path unless `mount: false` is set, and SHALL type the session from the
instance.

#### Scenario: Auth is mounted once

- **WHEN** `auth.ts` exports `betterAuth({ emailAndPassword: { enabled: true } })`, the auth service
  passes it, and `mount: false` is not set
- **THEN** RelKit serves the handler once at `/api/auth`, supplying the application's Drizzle client,
  provider and schema, without serializing options or callbacks

#### Scenario: Instance brings its own database

- **WHEN** the Better Auth instance configures its own database
- **THEN** RelKit uses that database and adds no auth tables to the application's migrations

#### Scenario: Check opens no connections

- **WHEN** `relkit check` imports the auth file
- **THEN** no network connection or timer is started

#### Scenario: Custom mount

- **WHEN** `mount: false` is set
- **THEN** RelKit serves no auth route until a route module mounts the service's handler

#### Scenario: Missing secret

- **WHEN** `BETTER_AUTH_SECRET` is absent at startup
- **THEN** startup fails with a coded error that names the variable
