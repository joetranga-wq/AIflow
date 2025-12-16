# Architecture Overview

This document describes the high-level architecture of AIFLOW.

## Core idea

AIFLOW is designed as a **decision-only layer**.
It evaluates context and produces a decision + explanation.
Execution always happens outside of AIFLOW.

## Main components

- Studio (UI)
- Runtime (CLI + browser)
- Flow definition (.aiflow)
- Trace engine

## Separation of concerns

- Studio edits flows
- Runtime executes flows
- External systems act on decisions

This separation is intentional and foundational.
