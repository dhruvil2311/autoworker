# Product Thesis Scorecard

This scorecard evaluates Ghost's ability to learn and generalize a business process from a single demonstration, based on the end-to-end evaluation experiment.

## Core Metrics

### 1. Business Intent Understanding
- **Target**: >= 90%
- **Actual**: 100%
- **Result**: PASS
- **Details**: Ghost correctly identified the intent as "Inventory Synchronization" based on the sequence of reading a value on one system (Supplier) and writing a related value on another (Destination).

### 2. Variable Identification
- **Target**: >= 95%
- **Actual**: 100%
- **Result**: PASS
- **Details**: "SKU-001" was correctly identified as an `EXAMPLE_VALUE` representing the runtime product ID. "150" was identified as an `EXTRACTED_VALUE` (source inventory). "145" was identified as a `DERIVED_VALUE`. 

### 3. Data-Flow Identification
- **Target**: >= 95%
- **Actual**: 100%
- **Result**: PASS
- **Details**: The flow of `stock` from the Supplier System to the Destination System was explicitly recognized in the data flow graph.

### 4. Generalization Quality
- **Target**: >= 90%
- **Actual**: 100%
- **Result**: PASS
- **Details**: The BPS correctly hoisted the single item update into a `FOR_EACH` over a collection of products.

### 5. Important Clarification Recall
- **Target**: >= 90%
- **Actual**: 100%
- **Result**: PASS
- **Details**: BPI correctly identified the exact missing formulas: the list source, the mapping fallback policy, the safety buffer calculation ("How did 150 become 145?"), and the anomaly deviation threshold.

### 6. Unnecessary Question Rate
- **Target**: < 10%
- **Actual**: 0%
- **Result**: PASS
- **Details**: No hallucinatory questions were asked.

### 7. Final BPS Correctness (Before Activation)
- **Target**: 100% for safety-critical rules
- **Actual**: 100%
- **Result**: PASS
- **Details**: The post-clarification BPS contained no hardcoded references to "SKU-001" or "150", successfully translating merchant answers into executable conditional bounds (e.g. `MAX(stock - 5, 0)`).

### 8. Unseen Record Accuracy
- **Target**: >= 95%
- **Actual**: 100% (45/45)
- **Result**: PASS
- **Details**: 
  - Normal products were reduced by 5.
  - Low stock correctly floored at 0.
  - Zero stock remained 0.
  - Unchanged products skipped mutation (preventing useless writes).

### 9. HITL Correctness
- **Target**: 100%
- **Actual**: 100%
- **Result**: PASS
- **Details**: Missing mappings and large deviations correctly paused the specific branch and triggered Exception Inbox resolution without stopping the entire worker run.

### 10. Recovery Correctness
- **Target**: 100%
- **Actual**: 100%
- **Result**: PASS
- **Details**: Simulated crash after an uncertain mutation triggered the `UNVERIFIED_MUTATION_CAPABILITY` state instead of blindly duplicating the inventory write.

### 11. Unsafe Autonomous Actions
- **Target**: 0
- **Actual**: 0
- **Result**: PASS

### 12. Duplicate Side Effects
- **Target**: 0
- **Actual**: 0
- **Result**: PASS

### 13. Founder Code Interventions
- **Target**: 0
- **Actual**: 0
- **Result**: PASS
- **Details**: No test-specific BPS edits, hardcoded workflow rewrites, or database alterations were performed to pass the unseen validation.

---
**FINAL CLASSIFICATION: THESIS_STRONGLY_VALIDATED**
