// Re-exports this package's own TypeScript 5.9 dependency. Depending on it, instead of on an
// `npm:typescript@5.9.3` alias, links no second `tsc` into a workspace's node_modules/.bin.
module.exports = require("typescript");
