import http from 'node:http';

const port = Number(process.env.PORT ?? '8081');
const expectedToken = process.env.KCC_GITHUB_MOCK_TOKEN ?? '';

function send(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method !== 'GET') {
    send(response, 405, { message: 'method not allowed' });
    return;
  }
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    send(response, 401, { message: 'bad credentials' });
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
          conclusion: 'success',
          event: 'push',
          head_branch: 'main',
          head_sha: 'abc123',
          html_url: `${base}/actions/runs/701`,
          updated_at: '2026-10-15T06:30:00Z',
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
  console.log(`github background mock listening on ${port}`);
});
