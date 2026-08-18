const assert = require('node:assert/strict');
const test = require('node:test');

const { listProviders } = require('../electron/providers');
const {
  openAiCompatibleProvider,
} = require('../electron/providers/openaiCompatibleProvider');
const {
  replicateProvider,
} = require('../electron/providers/replicateProvider');

test('provider registry exposes serializable capability metadata', () => {
  const providers = listProviders();
  assert.ok(providers.some((item) => item.id === 'openai-compatible'));
  assert.ok(providers.some((item) => item.id === 'replicate'));
  for (const provider of providers) {
    assert.equal(typeof provider.generate, 'undefined');
    assert.equal(typeof provider.testConnection, 'undefined');
    assert.equal(typeof provider.listModels, 'undefined');
    assert.equal(typeof provider.cancel, 'undefined');
    assert.equal(typeof provider.capabilities, 'object');
  }
});

test('openai-compatible provider returns the normalized response contract', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200 });
  try {
    const result = await openAiCompatibleProvider.generate({
      payload: {
        endpoint: 'https://example.test',
        apiKey: 'test-key',
        model: 'gpt-image-2',
        prompt: 'test',
        size: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
      },
      references: [],
      signal: new AbortController().signal,
    });
    assert.equal(result.kind, 'response');
    assert.equal(result.response.ok, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('replicate provider rejects a model without owner/name', async () => {
  await assert.rejects(
    replicateProvider.generate({
      payload: { endpoint: 'https://example.test', model: 'flux-schnell' },
      references: [],
      signal: new AbortController().signal,
    }),
    /owner\/model/,
  );
});
