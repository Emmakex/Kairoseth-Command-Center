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

The Phase 3 standalone surface composes Today from feature-level components rather than one monolithic page: Quick Capture, metrics, Projects/Tasks/Alerts, Milestones, the workspace Decision Log and Timeline. The route page owns authentication, scope selection and data orchestration; feature components own their forms and presentation.

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

## Milestones / Hitos

Milestones are scoped to the same workspace/private boundary as their project. The management surface should show:

- parent project;
- milestone title;
- weight;
- status (`planned`, `active`, `done`, `cancelled`);
- due date when available.

Creating or changing a weighted milestone can change project progress, so the UI must treat milestone status as an operational project-progress control rather than decorative metadata.

## Decision Log / Registro de decisiones

Decisions are **workspace-only**. They must never be stored in or presented as part of private scope.

The initial manual-use surface supports creating and reading a decision with:

- title;
- optional context;
- final decision text;
- status and timestamp in the history list.

Project association is intentionally not offered by the creation form until the API enforces same-workspace referential validation. Supersede/reverse actions are also deferred until the Decision lifecycle API is implemented so the UI cannot imply semantics the backend does not yet guarantee.

## Timeline / Actividad

Timeline is a read-only manual audit surface backed exclusively by server-authored events. The browser cannot create arbitrary audit entries.

The Timeline follows the same authenticated `workspace` or `private` scope as the rest of Today. It should present human-readable activity rather than implementation detail:

- localize known event types in ES/EN;
- localize status metadata instead of displaying raw enum values;
- format timestamps with the signed-in user locale/timezone;
- show a concise entity summary;
- never expose raw actor IDs, tenant IDs, source internals or event JSON in the main dashboard;
- keep technical metadata behind a future diagnostic/detail view.

The API may retain/return a larger scoped history, while Today shows only the 30 most recent events to keep the dashboard operational and readable.

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

The Decision Log is hidden/replaced by an explanatory workspace-only state in private view. Milestones remain available in private view only when their parent project is private. Timeline switches with the same scope selector so private audit history cannot bleed into workspace history or vice versa.

## Role-aware interface

Navigation is capability-driven. A member sees only authorized modules/actions. An owner/admin may see workspace administration. Kairoseth internal capabilities never appear solely because the user is an admin of a customer workspace.

## Responsive behavior

Desktop-first for dense operations, fully responsive for tablet/mobile quick actions. Mobile prioritizes:

- Today;
- quick capture;
- My Tasks;
- alerts;
- project status;
- reminders;
- recent activity.

Milestone and Decision forms collapse to one column on small screens, mutation actions remain usable without horizontal scrolling, and Timeline labels/statuses stack vertically when needed.

## Accessibility

- Keyboard navigation.
- Semantic headings/landmarks.
- Visible focus states.
- Sufficient contrast.
- Status not communicated by color alone.
- Screen-reader labels for icons and status controls.
- Timeline timestamps use semantic `time` elements.

## Internationalization

All UI strings are externalized from day one. ES and EN are release-blocking locales, not a later translation pass. Dates, times and relative deadlines must respect user locale/timezone.
