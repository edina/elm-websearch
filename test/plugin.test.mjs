import assert from 'node:assert/strict';
import test from 'node:test';

import ElmWebsearchPlugin, { ElmWebsearchPlugin as NamedElmWebsearchPlugin } from '../dist/index.js';

function toolContext() {
  return {
    sessionID: 'session',
    messageID: 'message',
    agent: 'build',
    id: 'call',
    async progress() {},
  };
}

async function registeredPluginFeatures() {
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
    skill: { transform: transform('skill') },
    tool: { transform: transform('tool') },
  });

  return features;
}

test('exports a V2 plugin that registers its bundled skill and tool', async () => {
  assert.equal(ElmWebsearchPlugin, NamedElmWebsearchPlugin);
  assert.equal(ElmWebsearchPlugin.id, 'elm-websearch');

  const features = await registeredPluginFeatures();
  assert.equal(features.skill.id, 'elm-websearch');
  assert.equal(features.skill.name, 'elm-websearch');
  assert.equal(features.skill.autoinvoke, true);
  assert.match(features.skill.content, /^# ELM web search/m);
  assert.doesNotMatch(features.skill.content, /^---/);
  assert.equal(features.tool.name, 'elm-websearch');
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
  await assert.rejects(websearch.execute({ query: 'test' }, toolContext()), /ELM_API_KEY must be set/);
});
