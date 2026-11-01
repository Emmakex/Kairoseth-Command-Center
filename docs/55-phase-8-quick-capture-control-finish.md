# Phase 8 — Quick Capture control finish

## Goal

Polish the primary Quick Capture controls so the form feels balanced, touch-friendly and visually finished without changing any behavior.

## Accepted behavior

- the task/project select uses a controlled chevron instead of the browser-native arrow;
- the chevron keeps visible breathing room from the right edge;
- the select reserves enough right padding so text never collides with the chevron;
- select, title input and Create button share a 44px minimum control height;
- keyboard focus behavior remains unchanged;
- mobile remains single-column and touch-friendly;
- no operation payload, API, persistence, RBAC, scope or i18n behavior changes.

## Validation

- standard CI must be green;
- Work Manager Live Preview must be green;
- post-merge OVH deployment must pass health checks and the public HTTPS probe.
