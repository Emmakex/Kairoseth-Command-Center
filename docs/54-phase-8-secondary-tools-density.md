# Phase 8 — Secondary tools density acceptance

## Goal

Reduce the vertical footprint of the secondary `Today` toolbox while preserving every existing tool and disclosure behavior.

## Accepted behavior

- The secondary-tools eyebrow is visually removed because the section title already establishes hierarchy.
- When all category disclosures are closed on desktop, the available categories render in a compact two-column grid.
- When any category disclosure is opened, the category stack automatically returns to one column so expanded content keeps the full available width.
- Mobile always remains one column.
- Planning, automation, integrations, Agent Bridge, account and member capabilities are unchanged.
- Existing entitlement, capability and workspace/private conditions remain authoritative.
- Keyboard/focus behavior and native `details` semantics remain unchanged.

## Scope

Visual density only. No API, persistence, RBAC, integration, automation, Agent Bridge or data-model changes.
