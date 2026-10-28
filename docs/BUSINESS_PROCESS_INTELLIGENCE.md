# Business Process Intelligence (BPI) Architecture

Ghost Retail Worker employs a **Hybrid Business Process Intelligence** architecture designed to bridge the gap between raw web automation recordings and deterministic, resilient workflow execution. 

Unlike naive record-and-replay tools, or fully autonomous web agents that are prone to hallucinations, Ghost relies on a rigorous reconciliation pipeline that separates what we *know* (deterministic evidence) from what we *believe* (semantic AI reasoning).

## The Pipeline

1. **Structured Demonstration**: The Chrome extension records granular user interactions (clicks, inputs, navigations) alongside rich DOM and context metadata, uploading a `NormalizedDemonstration`.
2. **Deterministic Evidence Extraction**: The BPI engine sweeps the events to extract indisputable facts: exactly what values were typed, which pages were visited, and if any values moved between systems (Data Flow).
3. **AI Semantic Interpretation**: A `SemanticBPIProvider` (OpenRouter) is queried for specific semantic judgements: intent inference, entity naming, and variable classification (e.g. is this string a literal constant, or a reference to a supplier's stock?).
4. **Structured Candidates**: AI interpretations are returned wrapped in an `Inference<T>` structure containing a `confidence` score, a `classification` (e.g. `INFERRED_RULE`), and an `evidence` array pointing back to the raw deterministic events.
5. **Deterministic Validation (Reconciliation)**: The deterministic engine audits the AI candidates. If the AI suggests a value is `DERIVED`, but there is no deterministic evidence for the formula, Ghost generates a `ProcessGap`.
6. **Clarification**: Gaps are surfaced to the merchant via specific, domain-relevant `ClarificationQuestion`s. Ghost handles the risk assessment to decide if a gap is blocking or discoverable during tests.
7. **Business Process Specification**: Once all blocking gaps are resolved, the engine compiles a strict, trustworthy `BusinessProcessSpecification`. 

*Only after this specification is verified does Ghost compile it into the executable DSL V2.*

## The `Inference<T>` Wrapper
Every BPI conclusion carries provenance:
```typescript
export interface Inference<T> {
  value: T;
  confidence: number;
  classification: "OBSERVED_FACT" | "INFERRED_RULE" | "ASSUMPTION" | "UNKNOWN";
  evidence: EvidenceReference[];
  reasoningSummary?: string; // Concise, user-safe reasoning summary. NO hidden CoT.
}
```

## Gap Detection Categories
Process Gaps ensure Ghost does not assume missing logic. Gaps are categorized logically:
- `SCOPE`: Missing iteration definitions.
- `SOURCE_OF_TRUTH`: Conflict between systems.
- `TRANSFORMATION`: Derived values without known formulas.
- `FAILURE_POLICY`, `SUCCESS_CRITERIA`, `SAFETY`, etc.

## Evaluation Fixtures
The BPI system is proven against robust scenarios (see `packages/bpi/src/pipeline.test.ts`):
- **Scenario A (Inventory Ambiguity)**: Validates that changed quantities do not become hardcoded variables, but correctly trigger `TRANSFORMATION` gaps.
- **Scenario B (B2B Order Extraction)**: Validates cross-system data flow detection.
- **Adversarial Tests**: Ensures coincidental or single-use inputs do not result in over-aggressive generalization.
