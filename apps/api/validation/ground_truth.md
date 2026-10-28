# Hidden Ground Truth Specification

This document contains the exact business logic and rules for the validation test. Ghost's inference and execution pipelines MUST NEVER access this file. It is used strictly by the human evaluator/validation script to score Ghost's understanding.

## GOAL
Synchronize destination inventory using supplier inventory.

## SCOPE
Process every ACTIVE supplier product.

## BUSINESS RULE
`available_stock = MAX(supplier_stock - safety_buffer, 0)`

## DEFAULT
`safety_buffer = 5`

## MATCHING
First match by explicit approved SKU mapping.
If an exact destination SKU exists, use it.
Never autonomously guess uncertain mappings.

## MISSING PRODUCT
Ask the merchant (HUMAN intervention).

## ANOMALY POLICY
If the proposed inventory change exceeds the configured deviation threshold, require merchant approval.

## DEFAULT DEVIATION THRESHOLD
20% (If absolute difference between proposed stock and current destination stock > 20% of current destination stock).

## FAILURE POLICY
An exception affecting one product should not destroy already completed work. Continue processing other safe records where workflow semantics allow.

## OUTPUT
Produce a final run report containing:
- products evaluated
- products updated
- products unchanged
- products requiring approval
- products with missing mappings
- failed products
