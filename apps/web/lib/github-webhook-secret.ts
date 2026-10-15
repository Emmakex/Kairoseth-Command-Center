import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';
const AAD = Buffer.from('kcc:github-webhook-secret:v1', 'utf8');
const MAX_AGE_MS = 3 * 60 * 1000;

export type GitHubWebhookSecretReveal = {
  path: string;
  secret: string;
  issuedAt: number;
};

function revealKey(sessionToken: string): Buffer {
  return createHash('sha256')
    .update('kcc:github-webhook-secret:')
    .update(sessionToken)
    .digest();
}

function validReveal(value: unknown): value is GitHubWebhookSecretReveal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GitHubWebhookSecretReveal>;
  return (
    typeof candidate.path === 'string' &&
    candidate.path.startsWith('/v1/integrations/github/webhooks/') &&
    candidate.path.length <= 512 &&
    typeof candidate.secret === 'string' &&
    candidate.secret.length > 0 &&
    candidate.secret.length <= 4096 &&
    typeof candidate.issuedAt === 'number' &&
    Number.isFinite(candidate.issuedAt)
  );
}

export function sealGitHubWebhookSecret(
  sessionToken: string,
  reveal: Omit<GitHubWebhookSecretReveal, 'issuedAt'>,
): string | null {
  const payload: GitHubWebhookSecretReveal = { ...reveal, issuedAt: Date.now() };
  if (!sessionToken || !validReveal(payload)) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', revealKey(sessionToken), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function unsealGitHubWebhookSecret(
  sessionToken: string,
  sealed: string,
  now = Date.now(),
): GitHubWebhookSecretReveal | null {
  if (!sessionToken || !sealed || sealed.length > 8192) return null;
  const [version, ivText, tagText, ciphertextText, ...extra] = sealed.split('.');
  if (version !== VERSION || !ivText || !tagText || !ciphertextText || extra.length) return null;

  try {
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    const ciphertext = Buffer.from(ciphertextText, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv('aes-256-gcm', revealKey(sessionToken), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const reveal = JSON.parse(plaintext) as unknown;
    if (!validReveal(reveal)) return null;
    if (reveal.issuedAt > now + 30_000 || now - reveal.issuedAt > MAX_AGE_MS) return null;
    return reveal;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderGitHubWebhookSecretHtml(
  locale: 'es' | 'en',
  reveal: GitHubWebhookSecretReveal,
): string {
  const es = locale === 'es';
  const title = es ? 'Secreto de webhook GitHub' : 'GitHub webhook secret';
  const warning = es
    ? 'Este secreto solo se muestra una vez. Cópialo ahora y guárdalo en GitHub.'
    : 'This secret is shown only once. Copy it now and save it in GitHub.';
  const pathLabel = es ? 'Ruta del payload' : 'Payload path';
  const secretLabel = es ? 'Secreto' : 'Secret';
  const eventsLabel = es ? 'Eventos' : 'Events';
  const back = es ? 'Volver al Gestor de Trabajo' : 'Back to Work Manager';
  const instructions = es
    ? 'Configura GitHub con Content type application/json y los eventos pull requests, issues, workflow runs y releases.'
    : 'Configure GitHub with Content type application/json and the pull requests, issues, workflow runs and releases events.';

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
    main{max-width:760px;margin:48px auto;padding:24px}
    article{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.06)}
    h1{margin-top:0;font-size:1.5rem}.warning{padding:12px 14px;border-radius:12px;background:#fff7ed;color:#9a3412;font-weight:700}
    dl{display:grid;gap:16px}dt{font-size:.78rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
    dd{margin:6px 0 0}code{display:block;overflow-wrap:anywhere;padding:12px;border-radius:12px;background:#0f172a;color:#f8fafc}
    a{display:inline-block;margin-top:18px;font-weight:800;color:#0f766e;text-decoration:none}p{line-height:1.6;color:#475569}
  </style>
</head>
<body>
  <main>
    <article>
      <h1>${escapeHtml(title)}</h1>
      <p class="warning">${escapeHtml(warning)}</p>
      <dl>
        <div><dt>${escapeHtml(pathLabel)}</dt><dd><code>${escapeHtml(reveal.path)}</code></dd></div>
        <div><dt>${escapeHtml(secretLabel)}</dt><dd><code>${escapeHtml(reveal.secret)}</code></dd></div>
        <div><dt>${escapeHtml(eventsLabel)}</dt><dd>${escapeHtml(instructions)}</dd></div>
      </dl>
      <a href="/${locale}?scope=workspace">${escapeHtml(back)}</a>
    </article>
  </main>
</body>
</html>`;
}
