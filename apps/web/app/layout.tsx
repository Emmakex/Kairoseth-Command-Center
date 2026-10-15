import type { Metadata } from 'next';
import './globals.css';
import './management.css';
import './integration-activity.css';
import './github-setup.css';

export const metadata: Metadata = {
  title: 'Kairoseth Command Center',
  description: 'Intelligent command center for projects, tasks, alerts and personal work.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
