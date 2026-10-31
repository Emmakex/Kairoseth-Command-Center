import type { ReactNode } from 'react';

export function DashboardDisclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="dashboard-disclosure">
      <summary>
        <span className="disclosure-copy">
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <span className="disclosure-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}
