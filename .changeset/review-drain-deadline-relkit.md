---
"relkit": patch
---

An answer that leaves its request body unread waits at most 500 ms for the rest of that body. A client that stalls or trickles its upload now gets the answer and a closing connection, not a response held until the upload ends.
