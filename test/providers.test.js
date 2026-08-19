const assert = require('node:assert/strict');
const test = require('node:test');

const { listProviders } = require('../electron/providers');
const {
  openAiCompatibleProvider,
} = require('../electron/providers/openaiCompatibleProvider');
const {
  replicateProvider,
} = require('../electron/providers/replicateProvider');
const {
  normalizeGenerationRequest,
  normalizeProviderResult,
  planGenerationBatches,
  resolveProviderCapabilities,
  validateGenerationRequest,
} = require('../electron/providers/providerContract');

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
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ data: [{ url: 'https://example.test/image.png' }] }),
  });
  try {
    const result = await openAiCompatibleProvider.generate({
      request: normalizeGenerationRequest({
        endpoint: 'https://example.test',
        apiKey: 'test-key',
        model: 'gpt-image-2',
        prompt: 'test',
        size: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
      }),
      signal: new AbortController().signal,
      count: 1,
    });
    assert.deepEqual(result, {
      kind: 'result',
      items: [{ url: 'https://example.test/image.png' }],
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('replicate provider validates a model without owner/name', () => {
  const request = normalizeGenerationRequest({
    endpoint: 'https://example.test',
    apiKey: 'test-key',
    model: 'flux-schnell',
    prompt: 'test',
  });
  const capabilities = resolveProviderCapabilities(replicateProvider, request);
  assert.match(
    validateGenerationRequest(replicateProvider, request, capabilities),
    /owner\/model/,
  );
});

test('provider capabilities support model-specific overrides', () => {
  const provider = {
    capabilities: {
      imageToImage: true,
      references: true,
      maxReferences: 1,
      maxCount: 4,
      nativeBatchLimit: 2,
    },
    getCapabilities: ({ model }) =>
      model === 'multi-reference' ? { maxReferences: 3 } : {},
  };
  const capabilities = resolveProviderCapabilities(provider, {
    model: 'multi-reference',
  });
  assert.equal(capabilities.maxReferences, 3);
  assert.equal(capabilities.maxCount, 4);
  assert.deepEqual(planGenerationBatches(4, capabilities), [2, 2]);
});

test('openai-compatible disables streaming for unofficial endpoints', () => {
  const capabilities = resolveProviderCapabilities(openAiCompatibleProvider, {
    endpoint: 'https://images.example.test/v1',
    model: 'custom-image-model',
  });
  assert.equal(capabilities.streaming, false);
  assert.equal(capabilities.partialPreview, false);
});

test('provider validation honors optional credentials and reference limits', () => {
  const provider = {
    capabilities: {
      requiresEndpoint: false,
      requiresApiKey: false,
      imageToImage: true,
      references: true,
      maxReferences: 2,
      maxCount: 10,
      nativeBatchLimit: 4,
    },
  };
  const request = normalizeGenerationRequest({
    providerId: 'local-provider',
    prompt: 'test',
    count: 10,
    references: [
      { data: 'data:image/png;base64,YQ==' },
      { data: 'data:image/png;base64,Yg==' },
      { data: 'data:image/png;base64,Yw==' },
    ],
  });
  const capabilities = resolveProviderCapabilities(provider, request);

  assert.match(
    validateGenerationRequest(provider, request, capabilities),
    /2.*参考图/,
  );
  assert.deepEqual(
    planGenerationBatches(request.count, capabilities),
    [4, 4, 2],
  );

  const validRequest = normalizeGenerationRequest({
    providerId: 'local-provider',
    prompt: 'test',
  });
  assert.equal(
    validateGenerationRequest(provider, validRequest, capabilities),
    '',
  );
});

test('provider result normalization accepts common image aliases', () => {
  const result = normalizeProviderResult({
    kind: 'result',
    items: [
      { image_url: 'https://example.test/one.png' },
      { b64_json: 'YWJj', mime_type: 'image/png' },
    ],
  });
  assert.deepEqual(result.items, [
    {
      url: 'https://example.test/one.png',
      mimeType: '',
      authenticatedDownload: true,
    },
    {
      base64: 'YWJj',
      mimeType: 'image/png',
      authenticatedDownload: true,
    },
  ]);
});

test('provider result preserves unauthenticated signed download URLs', () => {
  const result = normalizeProviderResult({
    kind: 'result',
    items: [
      {
        url: 'https://signed.example.test/image.png',
        authenticatedDownload: false,
      },
    ],
  });
  assert.equal(result.items[0].authenticatedDownload, false);
});
