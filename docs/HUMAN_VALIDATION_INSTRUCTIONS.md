# Human Validation Instructions

**STATUS: HUMAN_ACTION_REQUIRED**

The technical infrastructure for atomic queuing, tenant isolation, and artifact freezing is in place.

To maintain strict experimental integrity and prevent accidental "memorization" of expected business logic, I have paused execution. You must now perform the three genuine human demonstrations.

## The Objective
You must perform three materially different repetitive business workflows in the browser, exactly as a real merchant would.

### Recommended Categories:
1. **WORKFLOW 1:** Record synchronization or inventory. (Do *not* reuse the previous test fixture. E.g., Syncing pricing from Supplier to Shopify).
2. **WORKFLOW 2:** Transactional process. (E.g., Order fulfillment, invoice reconciliation).
3. **WORKFLOW 3:** Analytical or reporting process. (E.g., Scraping daily sales, compiling a shipment tracking list).

## Instructions for Each Workflow

### 1. Preparation
- Choose a repetitive browser-based business task you genuinely understand.
- **DO NOT tell Ghost the complete rules beforehand.**
- **DO NOT tell me (the developer/agent) the exact expected automation if avoidable.**

### 2. Demonstration
- Load the target website(s) in your browser.
- Start the Ghost Chrome Extension recording.
- Perform one (or a small number) of normal examples naturally.
- Stop the recording.
- Submit the recording to the Ghost local backend API (`POST /api/v1/recordings`).

### 3. Artifact Freezing
Once submitted, run the blind validation script to freeze the initial recording and the generated clarifications:
```bash
npx tsx apps/api/validation/blind-validator.ts create
```
*(Note the Session ID returned).*

### 4. Clarification
- Wait until Ghost analyzes the recording and produces clarification questions.
- Answer the questions naturally through the UI (or API).
- Ghost will generate the final Business Process Specification (BPS).
- Freeze the final BPS.

### 5. Ground Truth & Evaluation
- **Only after the freeze**, write down the explicit Ground Truth rules for the process.
- Compare the frozen BPS against your Ground Truth to evaluate if Ghost successfully generalized the process without hardcoding your demonstration.
- Run the workflow on unseen data and observe the results (HITL exceptions, etc.).

---