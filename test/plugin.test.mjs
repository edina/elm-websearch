import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Host } from '@opencode/plugin/host';
import { Skill, WebSearch } from '@opencode/plugin';
import { Schema } from 'effect';

import ElmWebsearchPlugin, { ElmWebsearchPlugin as NamedElmWebsearchPlugin } from '../dist/index.js';

function toolContext() {
  return {
    sessionID: 'session',
    messageID: 'message',
    agent: 'build',
    id: 'call',
    signal: new AbortController().signal,
    async progress() {},
  };
}

async function registeredPluginFeatures(connection = {
  async active() { return undefined; },
  async resolve() { return undefined; },
}) {
  const features = {};
  const transform = (key) => async (callback) => {
    callback({
      list: () => [],
      add: (value) => {
        features[key] = value;
      },
      update() {},
      remove() {},
    });
  };

  await ElmWebsearchPlugin.setup({
    integration: { connection },
    skill: { transform: transform('skill') },
    tool: { transform: transform('tool') },
    websearch: { transform: transform('websearch') },
  });

  return features;
}

test('exports a V2 plugin that registers its bundled skill, tool, and search provider', async () => {
  assert.equal(ElmWebsearchPlugin, NamedElmWebsearchPlugin);
  assert.equal(ElmWebsearchPlugin.id, 'elm-websearch');

  const features = await registeredPluginFeatures();
  assert.equal(features.skill.id, 'elm-websearch');
  assert.equal(features.skill.name, 'elm-websearch');
  assert.equal(features.skill.autoinvoke, true);
  assert.match(features.skill.content, /^# ELM web search/m);
  assert.doesNotMatch(features.skill.content, /^---/);
  Schema.decodeUnknownSync(Skill.Info)(features.skill);
  assert.ok(features.skill.path.endsWith('/skills/elm-websearch/SKILL.md'));
  assert.equal(features.tool.name, 'elm-websearch');
  assert.equal(features.websearch.id, 'elm');
  assert.equal(features.websearch.name, 'University of Edinburgh ELM');
});

test('OpenCode V2 resolves and loads the package entrypoint', async () => {
  const { server } = Host.resolve({ directory: fileURLToPath(new URL('..', import.meta.url)) });
  assert.ok(server?.endsWith('/dist/index.js'));
  const loaded = await Host.load(server);
  assert.equal(loaded.default.id, 'elm-websearch');
  assert.equal(typeof loaded.default.setup, 'function');
});

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

  const { tool: websearch } = await registeredPluginFeatures();
  assert.ok(websearch);

  const result = await websearch.execute({ query: 'OpenCode release' }, toolContext());
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

  const { tool: websearch } = await registeredPluginFeatures();
  assert.ok(websearch);
  await assert.rejects(websearch.execute({ query: 'test' }, toolContext()), /Connect University of Edinburgh ELM.*or set ELM_API_KEY/);
});

function mockSearch(t, response, status = 200) {
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
  process.env.ELM_API_BASE_URL = 'https://elm.example/api/v1///';
  const requests = [];
  globalThis.fetch = async (url, init) => {
    init.signal.throwIfAborted();
    requests.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  };
  return requests;
}

test('both search entrypoints use the models plugin credential without an environment key', async (t) => {
  const requests = mockSearch(t, { results: [] });
  delete process.env.ELM_API_KEY;
  const activeConnection = { type: 'credential', id: 'saved-elm-key' };
  let lookups = 0;
  const { websearch, tool } = await registeredPluginFeatures({
    async active(integrationID) {
      assert.equal(integrationID, 'elm');
      lookups++;
      return activeConnection;
    },
    async resolve(connection) {
      assert.equal(connection, activeConnection);
      return { type: 'key', key: 'saved-key' };
    },
  });
  assert.equal(lookups, 0);
  for (const entrypoint of [websearch, tool]) {
    await entrypoint.execute({ query: 'test' }, toolContext());
    assert.equal(requests.at(-1).init.headers.Authorization, 'Bearer saved-key');
  }
  assert.equal(lookups, 2);
});

test('search prefers the active credential over the environment and picks up key changes', async (t) => {
  const requests = mockSearch(t, { results: [] });
  let key = 'first-key';
  const { websearch } = await registeredPluginFeatures({
    async active() { return { type: 'credential', id: key }; },
    async resolve(connection) { return { type: 'key', key: connection.id }; },
  });
  await websearch.execute({ query: 'test' }, toolContext());
  key = 'second-key';
  await websearch.execute({ query: 'test' }, toolContext());
  assert.deepEqual(requests.map(({ init }) => init.headers.Authorization), [
    'Bearer first-key', 'Bearer second-key',
  ]);
});

test('search falls back to the environment when the active connection has no usable key', async (t) => {
  const requests = mockSearch(t, { results: [] });
  for (const credential of [undefined, { type: 'key', key: '  ' }, { type: 'oauth', access: 'other-token' }]) {
    const { websearch } = await registeredPluginFeatures({
      async active() { return { type: 'credential', id: 'saved-key' }; },
      async resolve() { return credential; },
    });
    await websearch.execute({ query: 'test' }, toolContext());
    assert.equal(requests.at(-1).init.headers.Authorization, 'Bearer test-key');
  }
});

test('credential resolution errors stop the request', async (t) => {
  const requests = mockSearch(t, { results: [] });
  const { websearch } = await registeredPluginFeatures({
    async active() { return { type: 'credential', id: 'saved-key' }; },
    async resolve() { throw new Error('Credential unavailable'); },
  });
  await assert.rejects(websearch.execute({ query: 'test' }, toolContext()), /Credential unavailable/);
  assert.equal(requests.length, 0);
});

test('native web search converts ELM results into the OpenCode result schema', async (t) => {
  const requests = mockSearch(t, {
    results: [
      { title: 'ELM result', link: 'https://example.com/1', snippet: 'Summary', raw_content: 'Full text' },
      { name: 'Linkup result', url: 'https://example.com/2', content: 'Content' },
      { title: 'Snippet result', link: 'https://example.com/3', snippet: 'Snippet', raw_content: null },
    ],
  });
  const { websearch } = await registeredPluginFeatures();
  const results = await websearch.execute({ query: 'test query' }, toolContext());
  assert.deepEqual(results, [
    { url: 'https://example.com/1', title: 'ELM result', content: 'Full text', time: {} },
    { url: 'https://example.com/2', title: 'Linkup result', content: 'Content', time: {} },
    { url: 'https://example.com/3', title: 'Snippet result', content: 'Snippet', time: {} },
  ]);
  for (const result of results) Schema.decodeUnknownSync(WebSearch.Result)(result);
  assert.equal(requests[0].url, 'https://elm.example/api/v1/search');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    q: 'test query', depth: 'standard', outputType: 'searchResults', maxResults: 10,
  });
});

test('native web search preserves valid publication dates as UTC milliseconds', async (t) => {
  const dates = ['2026-11-16', '2024-02-29', '1970-01-01'];
  mockSearch(t, {
    results: dates.map((publishedAt) => ({ url: 'https://example.com/article', publishedAt })),
  });
  const { websearch } = await registeredPluginFeatures();
  const results = await websearch.execute({ query: 'recent news' }, toolContext());
  assert.deepEqual(results.map((result) => result.time), [
    { published: Date.UTC(2026, 10, 16) },
    { published: Date.UTC(2024, 1, 29) },
    { published: 0 },
  ]);
  for (const result of results) Schema.decodeUnknownSync(WebSearch.Result)(result);
});

test('native web search omits missing or invalid publication dates', async (t) => {
  const dates = [undefined, null, '', 'invalid', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-1', 0];
  mockSearch(t, {
    results: dates.map((publishedAt) => ({ url: 'https://example.com/article', publishedAt })),
  });
  const { websearch } = await registeredPluginFeatures();
  const results = await websearch.execute({ query: 'recent news' }, toolContext());
  assert.equal(results.length, dates.length);
  for (const result of results) {
    assert.deepEqual(result.time, {});
    Schema.decodeUnknownSync(WebSearch.Result)(result);
  }
});

test('native web search accepts an empty result list', async (t) => {
  mockSearch(t, { results: [] });
  const { websearch } = await registeredPluginFeatures();
  assert.deepEqual(await websearch.execute({ query: 'test' }, toolContext()), []);
});

test('native web search reports HTTP failures and malformed results', async (t) => {
  const { websearch } = await registeredPluginFeatures();
  for (const [response, status, error] of [
    [{ error: 'Access denied' }, 403, /HTTP 403.*Access denied/],
    [{ answer: 'Unexpected answer' }, 200, /must contain a results array/],
    [{ results: [null] }, 200, /must be an object/],
    [{ results: [{ title: 'Missing URL' }] }, 200, /must contain a URL/],
  ]) {
    await t.test(String(error), async (t) => {
      mockSearch(t, response, status);
      await assert.rejects(websearch.execute({ query: 'test' }, toolContext()), error);
    });
  }
});

test('both search entrypoints forward cancellation to the request', async (t) => {
  const requests = mockSearch(t, { results: [] });
  const { websearch, tool } = await registeredPluginFeatures();
  for (const entrypoint of [websearch, tool]) {
    const controller = new AbortController();
    await entrypoint.execute({ query: 'test' }, { ...toolContext(), signal: controller.signal });
    const { signal } = requests.at(-1).init;
    assert.equal(signal.aborted, false);
    controller.abort();
    assert.equal(signal.aborted, true);
    await assert.rejects(
      entrypoint.execute({ query: 'test' }, { ...toolContext(), signal: controller.signal }),
      { name: 'AbortError' },
    );
  }
});

test('the custom tool preserves advanced search options and validates date ranges', async (t) => {
  const requests = mockSearch(t, { results: [] });
  const { tool } = await registeredPluginFeatures();
  const result = await tool.execute({
    query: 'test', depth: 'deep', max_results: 25,
    include_domains: ['ed.ac.uk'], exclude_domains: ['example.com'],
    from_date: '2026-01-01', to_date: '2026-11-17',
  }, toolContext());
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    q: 'test', depth: 'deep', outputType: 'searchResults', maxResults: 25,
    includeDomains: ['ed.ac.uk'], excludeDomains: ['example.com'],
    fromDate: '2026-01-01', toDate: '2026-11-17',
  });
  assert.equal(result.metadata.depth, 'deep');
  await assert.rejects(tool.execute({
    query: 'test', from_date: '2026-11-17', to_date: '2026-01-01',
  }, toolContext()), /from_date must be on or before to_date/);
  assert.equal(requests.length, 1);
});
