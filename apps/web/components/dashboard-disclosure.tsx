import type { ReactNode } from 'react';
import styles from './dashboard-disclosure.module.css';

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
    <details className={styles.disclosure}>
      <summary className={styles.summary}>
        <span className={styles.copy}>
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">⌄</span>
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
