import type { Metadata } from 'next';
import './globals.css';
import './management.css';
import './integration-activity.css';
import './github-setup.css';
import './ux-premium.css';

export const metadata: Metadata = {
  title: 'Work Manager · Gestor de Trabajo',
  description: 'A calm workspace for projects, tasks, priorities and alerts.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
