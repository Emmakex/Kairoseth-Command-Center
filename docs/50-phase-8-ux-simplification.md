# Phase 8 UX simplification

This slice improves the live Work Manager dogfooding experience without adding product scope.

## Product principle

Work Manager should reduce cognitive load. The default Today surface must help a user answer three questions quickly:

1. What needs attention now?
2. What should I create or update?
3. What can stay out of the way until I need it?

Advanced capability remains available through progressive disclosure instead of competing with daily work.

## Changes

- Visible product identity uses Gestor de Trabajo / Work Manager instead of the internal KCC/Command Center label.
- The technical implementation phase is removed from the primary hero.
- Quick Capture defaults to type + title + create; description and priority remain optional.
- Daily summary, explainable priorities and operational work remain visible.
- Planning/follow-up, automation, integrations, and account/team controls are grouped into native accessible disclosures.
- A skip link, visible keyboard focus and reduced-motion handling are added to the Today experience.
- Native HTML controls remain the accessibility baseline; no JavaScript is required to open advanced sections.

## Acceptance

- Today remains usable with keyboard only.
- Advanced sections can be opened with native summary/details controls.
- The primary daily workflow is visible without scrolling through administration forms.
- Quick Capture can create a default task without opening optional fields.
- ES and EN labels remain available.
- Existing permissions still decide which advanced sections are rendered.
- No backend contract, tenancy boundary or authorization rule changes in this slice.
