# Runtime Notes

This document describes how the AIFLOW runtime is intended to behave.

## Execution model

- Deterministic by default
- Explicit retries
- Trace-first execution

## Provider abstraction

The runtime is provider-agnostic.
LLM providers are treated as interchangeable backends.

Exact implementations may evolve over time.
