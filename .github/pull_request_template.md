## Summary

<!-- What changed and why? -->

## OpenSpec

- [ ] This change needs an OpenSpec change — it adds a public API or descriptor kind, breaks existing behavior, adds a provider family, changes the graph or a protocol format, or is security-sensitive — and links the approved change here: <!-- link -->
- [ ] This change needs no OpenSpec change.

## Review checklist (stop-doing rules until 1.0)

- [ ] This change adds no new feature area (descriptor kind, provider family or integration), or the new feature area has an approved OpenSpec change, linked above.
- [ ] Creation still warns, and refuses only with `--strict`, on untested setups.
- [ ] No raw evidence or bug-fix report files are committed; full reports go to CI artifacts and releases, and bugs link their GitHub issue.
- [ ] No fast path applies to only one example application.
- [ ] AWS is not presented as the lead deploy target; Railway leads, then Vercel and Cloudflare.

## Checklist

- [ ] I added focused coverage for non-trivial behavior.
- [ ] I updated public documentation when the contract changed.
- [ ] I added a changeset, or this change does not require a release.
- [ ] I ran `bun run prepush`, or the relevant focused checks.
- [ ] I did not add credentials, private data, or generated build output.
