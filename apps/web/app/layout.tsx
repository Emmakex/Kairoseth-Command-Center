import type { Metadata } from 'next';
import './globals.css';

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
