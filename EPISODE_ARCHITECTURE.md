# Episode Architecture

**Implementation:** `packages/university/src/kes.ts`

Every execution can be recorded as an immutable Episode with workflow ID, tenant ID, merchant, timestamp, inputs, outputs, runtime events, failures, recovery steps, human intervention, success rate, cost, duration, confidence, and immutable hash.

Episodes are appended to `episodes.jsonl`. KES does not update or delete an episode after creation.
