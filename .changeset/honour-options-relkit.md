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

Fixed: the fields an event lists in `sensitiveFields` are recorded as `[REDACTED]` wherever RelKit
records the event's payload: the span of the function that publishes it (input and output), the
span of each event function that receives it, on delivery and on replay, and so the Inspector's
trace views and telemetry exporters that send those records. Before, the option was stored and
shown as a label and nothing was redacted. Publishers, event functions and replay receive the real
payload. A name matches a key anywhere in the payload; a dotted path such as `customer.email`
matches from its root.

Fixed: the local jobs backend enforces `maxDuration` and `maxElapsed` of a task. Before, both were
ignored. An attempt that works longer than `maxDuration` fails with `RELKIT_TIMEOUT` and is retried
while the task's `retry` allows it; time asleep or waiting to retry does not count. A run that
reaches `maxElapsed`, counted from its acceptance, is not retried. A run stopped by either limit
ends with the status `timed-out`. After the upgrade, a task on the local backend that declares a
limit and ran longer than it now times out.

Added: the diagnostic `RELKIT_JOB_TASK_OPTION_UNSUPPORTED` for a task limit that the selected jobs
backend does not enforce.
