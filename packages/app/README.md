# @relkit/app (deprecated)

RelKit's core package is now [`relkit`](https://www.npmjs.com/package/relkit). This final release of
`@relkit/app` re-exports `relkit` so existing imports keep working.

Run `relkit migrate` to rewrite `@relkit/app` imports to `relkit`, then remove `@relkit/app` from
your dependencies.
