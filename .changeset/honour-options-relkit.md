---
"relkit": patch
---

Fixed: an event function without `profile` uses the application's default event profile
(`defaults.event`), or its only event profile, as an event without `profile` does. Before, the
definition wrote the profile `default`, so an application with only named event profiles failed
`relkit check` unless every event function repeated the profile. A client that publishes an event
without a profile uses the only profile of its source.

One case behaves differently after the upgrade: an application that has an event profile named
`default` beside others and sets `defaults.event` to another one. An event function without
`profile` used `default` there and now uses `defaults.event`. Add `profile: "default"` to keep the
old binding.

The `profile` of an event function's descriptor is optional in its type and absent when the
definition names none.
