---
"relkit": patch
---

On Node, a connection the server closes after its answer (such as a 413 for an oversize body) is now closed gracefully: the server ends its side, keeps reading and discarding what the client is still sending for up to 2 seconds, and closes once the client ends its side. Closing at once could reset the connection, so a client still sending its body could see a dropped connection instead of the answer.
