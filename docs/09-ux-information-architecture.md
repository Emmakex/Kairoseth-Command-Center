# 09 — UX & information architecture / UX y arquitectura de información

## Primary navigation

Default product navigation:

```text
Today
Projects
Tasks
Alerts
Timeline
Decisions
Integrations
Personal (optional/private)
Settings
```

In Kairoseth-hosted deployments, product navigation can be wrapped by the Kairoseth Platform shell. In standalone deployments, Command Center provides its own shell.

## Today / Hoy

The default dashboard should answer four questions in under a few seconds:

1. What needs my attention today?
2. What is blocked or at risk?
3. What am I currently developing/working on?
4. What must not be forgotten?

Suggested sections:

- greeting/date/context;
- top priorities;
- active alerts;
- active projects with measurable progress;
- upcoming deadlines;
- recent activity;
- private reminders when enabled;
- quick capture.

## Progressive disclosure

Keep the first view operational and concise. Technical detail (raw integration metadata, event JSON, sync diagnostics) should live behind “details” or dedicated diagnostic screens.

## Project card

A project summary should show:

- name;
- status/health;
- progress and source of progress;
- current phase;
- blocker count;
- next action;
- last meaningful activity;
- primary external source link.

## Alert UX

Severity mapping:

- Low / Informational
- Normal
- Important
- Urgent
- Critical

The UI must distinguish **severity** from **status** (`open`, `acknowledged`, `resolved`). Alerts should explain why they exist and what source generated them.

## Quick capture

A persistent `+ Capture` action should accept plain language and allow immediate creation. Suggested structured interpretation can be edited.

## Personal vs workspace visual language

Private items must have a clear private indicator. Shared/workspace items should show the active workspace/team. Users should never have to guess whether a reminder is visible to colleagues.

## Role-aware interface

Navigation is capability-driven. A member sees only authorized modules/actions. An owner/admin may see workspace administration. Kairoseth internal capabilities never appear solely because the user is an admin of a customer workspace.

## Responsive behavior

Desktop-first for dense operations, fully responsive for tablet/mobile quick actions. Mobile prioritizes:

- Today;
- quick capture;
- My Tasks;
- alerts;
- project status;
- reminders.

## Accessibility

- Keyboard navigation.
- Semantic headings/landmarks.
- Visible focus states.
- Sufficient contrast.
- Status not communicated by color alone.
- Screen-reader labels for icons and status controls.

## Internationalization

All UI strings are externalized from day one. ES and EN are release-blocking locales, not a later translation pass. Dates, times and relative deadlines must respect user locale/timezone.
