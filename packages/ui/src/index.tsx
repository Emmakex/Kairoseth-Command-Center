import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article
      style={{
        minHeight: 150,
        padding: 24,
        border: '1px solid #dbe3ef',
        borderRadius: 22,
        background: '#ffffff',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.04)',
      }}
    >
      <span style={{ display: 'block', color: '#64748b', fontWeight: 650 }}>{title}</span>
      <strong
        style={{
          display: 'block',
          marginTop: 22,
          fontSize: '2.5rem',
          letterSpacing: '-0.04em',
        }}
      >
        {children}
      </strong>
    </article>
  );
}
