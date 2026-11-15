---
"relkit": patch
---

A JSON request body is read as UTF-8 text and no longer stored with replacement characters. A body with bytes that are not valid UTF-8 (such as `Caf\xe9` sent as Latin-1), or a `Content-Type` that declares a charset other than UTF-8 (such as `application/json; charset=iso-8859-1`), answers `422` with a `malformed-json` or `content-type` issue instead of being accepted with U+FFFD in place of the bad bytes. A lone surrogate written as a `\ud800` escape is legal JSON and is kept as sent.
