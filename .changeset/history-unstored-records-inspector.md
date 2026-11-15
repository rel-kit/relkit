---
"@relkit/inspector": patch
---

The Inspector counts and names the records it collected but could not store, instead of reporting that nothing was lost. It still acknowledges a batch to the application only once history holds it, so a batch that could not be stored stays in the application's inspection buffer and is stored when history works again. Two cases lose records, and both now show in `/_relkit/v1/storage` as `recordsLostBeforeHistory.byHistoryStore`, keep `incomplete: true` for the rest of the Inspector's run, and leave a `RELKIT_INSPECTION_INCOMPLETE` diagnostic in history that says how many records and which: a record the history store refuses (the rest of its batch is now stored one record at a time instead of failing with it), and a batch whose application session ended before history could store it.
