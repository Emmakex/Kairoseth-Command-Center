import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { parseAgentBridgeCommandResponse } from '../../../../lib/agent-bridge-command';
import { planAgentBridgeExecution } from '../../../../lib/agent-bridge-execution';
import { parseAgentBridgeToolInventoryResponse } from '../../../../lib/agent-bridge-tools';
import { sameOriginRedirect, sameOriginUrl } from '../../../../lib/public-url';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function safeText(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return null;
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return normalized;
}

function agentBridgeUrl(
  locale: 'es' | 'en',
  result: string,
  commandId?: string,
) {
  const url = sameOriginUrl(`/${locale}/ia/agent-bridge`);
  url.searchParams.set('execution', result);
  if (commandId) url.searchParams.set('command', commandId);
  return url;
}

function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return response;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return sameOriginRedirect(agentBridgeUrl('es', 'invalid'));
  }

  const locale = safeLocale(form.get('locale'));
  const installationId = safeText(form.get('installationId'), 512);
  const executionToolId = safeText(form.get('executionToolId'), 512);
  const rawInput = typeof form.get('input') === 'string' ? String(form.get('input')) : '';
  if (!installationId || !executionToolId) {
    return sameOriginRedirect(agentBridgeUrl(locale, 'invalid'));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return sameOriginRedirect(`/${locale}/login`);

  try {
    const inventoryResponse = await fetch(
      `${apiBaseUrl()}/v1/products/agent-bridge/installations/${encodeURIComponent(installationId)}/tools`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (inventoryResponse.status === 401) {
      return clearSession(sameOriginRedirect(`/${locale}/login`));
    }
    if (!inventoryResponse.ok) {
      const result =
        inventoryResponse.status === 403
          ? 'forbidden'
          : inventoryResponse.status === 404
            ? 'inventory_missing'
            : inventoryResponse.status === 503
              ? 'unavailable'
              : 'error';
      return sameOriginRedirect(agentBridgeUrl(locale, result));
    }

    const inventoryBody = parseAgentBridgeToolInventoryResponse(await inventoryResponse.json());
    if (!inventoryBody || inventoryBody.inventory.installationId !== installationId) {
      return sameOriginRedirect(agentBridgeUrl(locale, 'invalid_inventory'));
    }

    const planned = planAgentBridgeExecution(
      inventoryBody.inventory,
      executionToolId,
      rawInput,
    );
    if ('error' in planned) {
      const result =
        planned.error === 'tool_not_found'
          ? 'tool_missing'
          : planned.error === 'tool_blocked'
            ? 'tool_blocked'
            : planned.error === 'input_too_large'
              ? 'input_too_large'
              : 'invalid_input';
      return sameOriginRedirect(agentBridgeUrl(locale, result));
    }

    const path = planned.plan.endpointKind === 'read' ? 'commands' : 'approved-commands';
    const executionResponse = await fetch(
      `${apiBaseUrl()}/v1/products/agent-bridge/installations/${encodeURIComponent(installationId)}/${path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          toolId: planned.plan.tool.executionToolId,
          input: planned.plan.input,
          correlationId: randomUUID(),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (executionResponse.status === 401) {
      return clearSession(sameOriginRedirect(`/${locale}/login`));
    }
    if (!executionResponse.ok) {
      const result =
        executionResponse.status === 403
          ? 'forbidden'
          : executionResponse.status === 409
            ? 'tool_blocked'
            : executionResponse.status === 503
              ? 'unavailable'
              : executionResponse.status === 400
                ? 'invalid'
                : 'error';
      return sameOriginRedirect(agentBridgeUrl(locale, result));
    }

    const queued = parseAgentBridgeCommandResponse(await executionResponse.json());
    if (
      !queued ||
      queued.command.installationId !== installationId ||
      queued.command.toolId !== executionToolId
    ) {
      return sameOriginRedirect(agentBridgeUrl(locale, 'invalid_response'));
    }

    return sameOriginRedirect(agentBridgeUrl(locale, 'queued', queued.command.commandId));
  } catch {
    return sameOriginRedirect(agentBridgeUrl(locale, 'error'));
  }
}
