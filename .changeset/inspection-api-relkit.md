---
"relkit": patch
---

The inspection API now passes a channel's declared `params`, `replay` and `presence`, and an agent's `modelSource` and `instructions`, through the graph projection, so the Inspector shows a channel's partition parameters and replay window instead of "Not declared" and "live only".
