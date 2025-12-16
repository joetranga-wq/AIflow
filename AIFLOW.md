# AIFLOW — Open Standard (v0.1)

This document defines the **public AIFLOW Standard**.

It specifies what an AIFLOW-compliant system guarantees,
while intentionally leaving implementation details open.

---

## Design goals

- Deterministic decision flows
- Explainability by default
- Provider-agnostic execution
- Portable, file-based workflows
- Trace-first debugging

---

## Philosophy: decision, not execution

AIFLOW workflows **decide**.
External systems **act**.

This separation ensures:
- Smaller blast radius
- Easier audits
- Safer AI adoption

AIFLOW never executes side-effects.

---

## Scope of the standard

The AIFLOW Standard defines:

- `.aiflow` file format
- Flow graph semantics
- Agent definitions
- Input variables
- Routing logic
- Decision outputs
- Trace format

---

## Explicit non-scope (by design)

The standard does **not** define:

- Business heuristics
- Risk scoring formulas
- Domain-specific rules
- Compliance interpretations
- Sector-specific logic

These are intentionally left to flow authors.

---

## Stability guarantees

- v0.1 schema is stable
- Backward compatibility within major versions
- Experimental features are explicitly marked

---

## Security model

- No credential storage
- No execution rights
- No system ownership

AIFLOW evaluates context and returns decisions only.

---

## Versioning

Each `.aiflow` file includes:
- name
- version
- description

Decision behavior is therefore:
- reviewable
- diffable
- auditable

---

## Non-goals

AIFLOW does not aim to:
- Replace automation platforms
- Compete with orchestration tools
- Act as a hosted AI service

AIFLOW is infrastructure.

---

_End of public standard._
