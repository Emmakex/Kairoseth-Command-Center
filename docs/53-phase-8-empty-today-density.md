# Phase 8 — Empty Today density acceptance

## Goal

Make the empty `Today` experience materially calmer without removing information or changing behavior when work exists.

## Accepted behavior

- `Quick Capture` keeps one clear heading instead of repeating the same label as eyebrow and title.
- The capture panel no longer repeats the active workspace/private scope badge because the authoritative scope switch is immediately above it in the Today hero.
- When Today is genuinely empty — no projects, tasks, alerts or priorities — the six zero-value metric cards are hidden.
- The existing `All clear / Todo despejado` state becomes the single empty-state summary.
- When Today has work, the full metric grid remains visible exactly as before.
- API-unavailable states are not treated as calm-empty and therefore do not hide diagnostic summary information.
- Quick Capture fields, optional details, operations, permissions and persistence are unchanged.
- ES/EN and workspace/private behavior are unchanged.
- Mobile remains single-column and all controls retain keyboard focus behavior.

## Scope

UX density only. No API, persistence, RBAC, automation, integration, Agent Bridge or data-model changes.
