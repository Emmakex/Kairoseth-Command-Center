export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const dictionary = {
  es: {
    eyebrow: 'Kairoseth Software',
    title: 'Command Center',
    subtitle: 'Tu trabajo, proyectos, alertas y prioridades en una sola pantalla.',
    today: 'Hoy',
    projects: 'Proyectos',
    tasks: 'Tareas',
    alerts: 'Alertas',
    status: 'Núcleo técnico en construcción',
    phase: 'Fase 1 · Core shell',
  },
  en: {
    eyebrow: 'Kairoseth Software',
    title: 'Command Center',
    subtitle: 'Your work, projects, alerts and priorities in one place.',
    today: 'Today',
    projects: 'Projects',
    tasks: 'Tasks',
    alerts: 'Alerts',
    status: 'Technical core under construction',
    phase: 'Phase 1 · Core shell',
  },
} as const;
