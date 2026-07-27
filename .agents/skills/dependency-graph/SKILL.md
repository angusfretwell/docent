---
name: dependency-graph
description: Build a dependency graph over a batch of work items — issues, tasks, tickets — and surface the frontier of items that can start now. Use when planning parallel or ordered execution, checking whether two items would collide, or when another skill needs to sequence a batch.
---

Given a batch of **work items**, map which block which. Look past the dependencies items declare outright — the ones that bite are implicit.

## Blocking edges

Item B is **blocked by** item A when B's text says so, and also when

- B needs something A produces — code, infrastructure, or data,
- B and A touch overlapping files or modules — a collision, not an order; pick one to go first and treat the other as blocked by it, or
- B's requirements hinge on a decision or interface A will establish.

## The frontier

The **frontier** is the set of still-open items with zero blockers — they can start now.

Recompute the frontier whenever an item completes.

Done when: every item is classified as frontier or blocked, and each blocked item names every item it waits on.
