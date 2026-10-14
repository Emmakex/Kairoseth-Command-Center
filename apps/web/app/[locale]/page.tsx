import { notFound } from 'next/navigation';
import { Card } from '@kcc/ui';
import { dictionary, isLocale, locales } from '../../lib/i18n';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function CommandCenterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const copy = dictionary[locale];

  return (
    <main className="shell">
      <header className="hero">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>{copy.status}</span>
          <strong>{copy.phase}</strong>
        </div>
      </header>

      <section className="grid" aria-label={copy.today}>
        <Card title={copy.today}>0</Card>
        <Card title={copy.projects}>0</Card>
        <Card title={copy.tasks}>0</Card>
        <Card title={copy.alerts}>0</Card>
      </section>
    </main>
  );
}
