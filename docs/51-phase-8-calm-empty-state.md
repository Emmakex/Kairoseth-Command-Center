# Phase 8 UX — calm empty Today

This microcut reduces repeated empty-state noise after the first Today simplification slice.

## Decision

When the authenticated Today data is available and there are no active projects, tasks, alerts or calculated priorities, the primary operational area renders one calm status instead of four separate empty panels.

Quick Capture, summary metrics and the progressively disclosed secondary tools remain available.

As soon as any project, task, alert or priority exists, the full priority and operational panels render again automatically.

## Accessibility and safety

- The empty state uses semantic heading/content and does not depend on JavaScript.
- The check only activates when Today and priority data are successfully available; API-unavailable states remain explicit.
- No persistence, authorization, tenancy or API contract changes are introduced.
- ES and EN copy are included.

## Acceptance

- Empty Today does not repeat empty messages for priorities, projects, tasks and alerts.
- Quick Capture remains immediately available.
- Metrics remain visible for orientation.
- Creating or receiving any work restores the normal operational surface.
