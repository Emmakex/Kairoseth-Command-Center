# 01 — Functional scope / Alcance funcional

## MVP modules / Módulos MVP

### Today / Hoy
- Daily priorities.
- Due and overdue tasks.
- Active blockers and alerts.
- Recently active projects.
- Upcoming deadlines.
- Quick capture.
- AI-assisted suggested focus, always explainable and editable.

### Projects / Proyectos
- Project list and status.
- Milestones/phases.
- Weighted progress based on completed work.
- Blockers, risks and next action.
- Links to source systems and repositories.
- Recent activity.

### Tasks / Tareas
- Personal and workspace tasks.
- Status: inbox, planned, in progress, blocked, done, cancelled.
- Priority: low, normal, important, urgent, critical.
- Due date, reminders, assignee, project, tags and dependencies.
- Recurrence-ready model.

### Alerts / Alertas
- Manual alerts.
- Deadline alerts.
- Integration-generated alerts.
- Severity and acknowledgement state.
- Deduplication and resolution.
- Examples: failing CI, unmerged PR, expiring certificate/domain, overdue publication.

### Timeline
- Human actions and integration events.
- Project milestones and key state changes.
- Searchable chronological context.

### Decisions / Decisiones
- Decision title, context, date, owner and status.
- Link to project/task/event.
- Superseded decisions remain auditable.

### Personal
- User-private tasks, reminders and notes.
- Never visible to organization administrators by default.
- Can coexist with work information without sharing its contents.

### Integrations
- GitHub is the first external integration.
- Connector framework must support GitLab, Calendar, Gmail/Microsoft 365, Jira, Slack and generic webhooks later.

## Quick capture / Captura rápida

Users can type natural-language input such as:

`Revisar mañana el runner de IA Empleado`

The system proposes structured fields (date, category, project, priority) before or after creation depending on confidence. Deterministic task creation remains available without AI.

## Progress rules / Reglas de progreso

Project progress must come from measurable milestones/tasks or an explicitly configured external source. No UI component should imply an authoritative percentage when the data is incomplete.

## Out of scope for MVP / Fuera del MVP

- Full CRM/ERP functionality.
- Full project management replacement for Jira/Linear.
- Billing engine.
- Native mobile applications.
- Complex workforce surveillance.
- Autonomous destructive actions in third-party systems.

## First release success criteria / Criterios de éxito

A user can create a workspace, create projects/tasks/alerts, distinguish private vs shared items, connect GitHub, see repository signals in project context, and deploy the product either within Kairoseth or as a standalone environment without changing domain logic.
