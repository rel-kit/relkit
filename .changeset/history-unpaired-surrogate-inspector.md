---
"@relkit/inspector": patch
---

One request whose data held an unpaired UTF-16 surrogate, such as a JSON body with `"\ud800"`, stopped the Inspector's history until the application session changed. DuckDB refused the record, so its whole batch failed, the Inspector closed its history worker, opened a new one every 30 seconds and failed on the same batch again, and every request after it was missing from history. History now stores such text with U+FFFD in place of each unpaired surrogate, as any UTF-8 encoder writes it, and the batch is stored with it.
