import { Buffer } from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';

const port = Number(process.env.PORT ?? '8081');
const expectedToken = process.env.KCC_GITHUB_MOCK_TOKEN ?? '';

let workflowState = {
  conclusion: 'failure',
  updatedAt: '2026-10-15T06:30:00Z',
};

function send(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    send(response, 401, { message: 'bad credentials' });
    return;
  }

  if (url.pathname === '/__test__/workflow') {
    if (request.method !== 'POST') {
      send(response, 405, { message: 'method not allowed' });
      return;
    }
    try {
      const body = await readJson(request);
      const conclusion = typeof body.conclusion === 'string' ? body.conclusion.trim() : '';
      const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt.trim() : '';
      if (!conclusion || !Number.isFinite(Date.parse(updatedAt))) {
        send(response, 400, { message: 'invalid workflow state' });
        return;
      }
      workflowState = { conclusion, updatedAt };
      send(response, 200, workflowState);
    } catch {
      send(response, 400, { message: 'invalid json' });
    }
    return;
  }

  if (request.method !== 'GET') {
    send(response, 405, { message: 'method not allowed' });
    return;
  }

  const repoMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/(pulls|issues|releases)$/);
  const runsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/);
  if (!repoMatch && !runsMatch) {
    send(response, 404, { message: 'not found' });
    return;
  }

  const match = repoMatch ?? runsMatch;
  const owner = decodeURIComponent(match?.[1] ?? 'owner');
  const repository = decodeURIComponent(match?.[2] ?? 'repository');
  const base = `https://github.example/${owner}/${repository}`;

  if (runsMatch) {
    send(response, 200, {
      workflow_runs: [
        {
          id: 701,
          name: 'CI',
          status: 'completed',
          conclusion: workflowState.conclusion,
          event: 'push',
          head_branch: 'main',
          head_sha: 'abc123',
          html_url: `${base}/actions/runs/701`,
          updated_at: workflowState.updatedAt,
        },
      ],
    });
    return;
  }

  if (repoMatch?.[3] === 'pulls') {
    send(response, 200, [
      {
        id: 501,
        number: 17,
        title: 'Background signals',
        state: 'closed',
        draft: false,
        html_url: `${base}/pull/17`,
        updated_at: '2026-10-15T06:00:00Z',
        merged_at: '2026-10-15T05:59:00Z',
      },
    ]);
    return;
  }

  if (repoMatch?.[3] === 'issues') {
    send(response, 200, [
      {
        id: 601,
        number: 20,
        title: 'Background issue',
        state: 'open',
        html_url: `${base}/issues/20`,
        updated_at: '2026-10-15T05:00:00Z',
      },
    ]);
    return;
  }

  send(response, 200, [
    {
      id: 801,
      tag_name: 'v0.5.0',
      name: 'Background release',
      draft: false,
      prerelease: false,
      target_commitish: 'main',
      html_url: `${base}/releases/tag/v0.5.0`,
      created_at: '2026-10-15T06:10:00Z',
      published_at: '2026-10-15T06:20:00Z',
    },
  ]);
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`github background mock listening on ${port}\n`);
});
