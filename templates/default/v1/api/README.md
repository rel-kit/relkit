# my-app

A ZSys TypeScript/Bun API project with a greeting route and a JSON echo
endpoint. Functions own the application handlers; routes describe transport
mapping and responses.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example routes are `GET /hello?name=ZSys` and `POST /echo` with a JSON
`message` field.
