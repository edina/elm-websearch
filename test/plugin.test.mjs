import assert from 'node:assert/strict';
import test from 'node:test';

import { ElmWebsearchPlugin } from '../dist/index.js';

function context() {
  return {
    sessionID: 'session',
    messageID: 'message',
    agent: 'build',
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  };
}

test('registers elm-websearch and uses the default endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ELM_API_KEY;
  const originalBaseURL = process.env.ELM_API_BASE_URL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELM_API_KEY;
    else process.env.ELM_API_KEY = originalKey;
    if (originalBaseURL === undefined) delete process.env.ELM_API_BASE_URL;
    else process.env.ELM_API_BASE_URL = originalBaseURL;
  });

  process.env.ELM_API_KEY = 'test-key';
  delete process.env.ELM_API_BASE_URL;

  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const plugin = await ElmWebsearchPlugin({});
  const websearch = plugin.tool?.['elm-websearch'];
  assert.ok(websearch);

  const result = await websearch.execute({ query: 'OpenCode release' }, context());
  assert.equal(request.url, 'https://elm.edina.ac.uk/api/v1/search');
  assert.equal(request.init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(request.init.body), {
    q: 'OpenCode release',
    depth: 'standard',
    outputType: 'searchResults',
    maxResults: 10,
  });
  assert.equal(result.metadata.depth, 'standard');
});

test('requires an API key before sending a request', async (t) => {
  const originalKey = process.env.ELM_API_KEY;
  t.after(() => {
    if (originalKey === undefined) delete process.env.ELM_API_KEY;
    else process.env.ELM_API_KEY = originalKey;
  });
  delete process.env.ELM_API_KEY;

  const plugin = await ElmWebsearchPlugin({});
  const websearch = plugin.tool?.['elm-websearch'];
  assert.ok(websearch);
  await assert.rejects(websearch.execute({ query: 'test' }, context()), /ELM_API_KEY must be set/);
});
