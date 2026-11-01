import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { parseAgentBridgeCommandResponse } from '../../../../lib/agent-bridge-command';
import { planAgentBridgeExecution } from '../../../../lib/agent-bridge-execution';
import { parseAgentBridgeToolInventoryResponse } from '../../../../lib/agent-bridge-tools';
import { publicRequestUrl } from '../../../../lib/public-url';

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
  request: NextRequest,
  locale: 'es' | 'en',
  result: string,
  commandId?: string,
) {
  const url = publicRequestUrl(request, `/${locale}/ia/agent-bridge`);
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
    return NextResponse.redirect(agentBridgeUrl(request, 'es', 'invalid'), 303);
  }

  const locale = safeLocale(form.get('locale'));
  const installationId = safeText(form.get('installationId'), 512);
  const executionToolId = safeText(form.get('executionToolId'), 512);
  const rawInput = typeof form.get('input') === 'string' ? String(form.get('input')) : '';
  if (!installationId || !executionToolId) {
    return NextResponse.redirect(agentBridgeUrl(request, locale, 'invalid'), 303);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303);

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
      return clearSession(NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303));
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
      return NextResponse.redirect(agentBridgeUrl(request, locale, result), 303);
    }

    const inventoryBody = parseAgentBridgeToolInventoryResponse(await inventoryResponse.json());
    if (!inventoryBody || inventoryBody.inventory.installationId !== installationId) {
      return NextResponse.redirect(agentBridgeUrl(request, locale, 'invalid_inventory'), 303);
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
      return NextResponse.redirect(agentBridgeUrl(request, locale, result), 303);
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
      return clearSession(NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303));
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
      return NextResponse.redirect(agentBridgeUrl(request, locale, result), 303);
    }

    const queued = parseAgentBridgeCommandResponse(await executionResponse.json());
    if (
      !queued ||
      queued.command.installationId !== installationId ||
      queued.command.toolId !== executionToolId
    ) {
      return NextResponse.redirect(agentBridgeUrl(request, locale, 'invalid_response'), 303);
    }

    return NextResponse.redirect(
      agentBridgeUrl(request, locale, 'queued', queued.command.commandId),
      303,
    );
  } catch {
    return NextResponse.redirect(agentBridgeUrl(request, locale, 'error'), 303);
  }
}
