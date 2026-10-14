import http from 'node:http';

const port = Number(process.env.PORT || 8080);
const expectedToken = process.env.KCC_GITHUB_MOCK_TOKEN;
if (!expectedToken) throw new Error('KCC_GITHUB_MOCK_TOKEN is required');

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') return json(res, 200, { ok: true });

  if (req.headers.authorization !== `Bearer ${expectedToken}`) {
    return json(res, 401, { message: 'Bad credentials' });
  }

  if (url.pathname === '/user') {
    return json(res, 200, { id: 101, login: 'mock-owner' });
  }

  if (url.pathname === '/repos/Emmakex/Kairoseth-Command-Center') {
    return json(res, 200, {
      id: 1418536661,
      full_name: 'Emmakex/Kairoseth-Command-Center',
      default_branch: 'main',
      html_url: 'https://github.com/Emmakex/Kairoseth-Command-Center',
      private: false,
      archived: false,
      updated_at: '2026-10-14T18:30:00Z',
    });
  }

  if (url.pathname === '/repos/Emmakex/Kairoseth-Command-Center/commits/main') {
    return json(res, 200, {
      sha: '0123456789abcdef0123456789abcdef01234567',
      html_url: 'https://github.com/Emmakex/Kairoseth-Command-Center/commit/0123456789abcdef0123456789abcdef01234567',
      commit: { committer: { date: '2026-10-14T18:29:00Z' } },
    });
  }

  return json(res, 404, { message: 'Not Found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GitHub mock listening on ${port}`);
});
