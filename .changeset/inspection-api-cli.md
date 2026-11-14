---
"@relkit/cli": patch
---

A generated server now forwards the originating request and the link to the publishing span when it runs an event reaction, so a request that publishes an event lists the reaction as a continuation in the Inspector.

The generated development server now provides the Inspector's "Publish event" and "Replay" actions instead of answering `RELKIT_INSPECTOR_ACTIONS_UNAVAILABLE`: a publication is validated against the event's schema and delivered like one from a function, and a replay publishes the stored payload again so the reactions run again.
