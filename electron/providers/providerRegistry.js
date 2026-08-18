const providers = new Map();

function registerProvider(provider) {
  if (!provider?.id || typeof provider.generate !== 'function') {
    throw new TypeError('Provider 必须包含 id 和 generate 方法');
  }
  providers.set(provider.id, provider);
  return provider;
}

function getProvider(id) {
  return providers.get(String(id || 'openai-compatible')) || null;
}

function listProviders() {
  return Array.from(providers.values()).map(
    ({ generate, testConnection, cancel, ...metadata }) => metadata,
  );
}

module.exports = { getProvider, listProviders, registerProvider };
