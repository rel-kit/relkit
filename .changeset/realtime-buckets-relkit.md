---
"relkit": patch
---

A realtime subscription whose identity scope or session epoch does not match the session now answers `409` with `IDENTITY_PRECONDITION_FAILED` before any stream is opened; it used to open the stream and fail inside it, which a client saw as `500`. Channel authorization is unchanged: a channel the caller cannot read still ends the stream with the concealed `NOT_FOUND`.
