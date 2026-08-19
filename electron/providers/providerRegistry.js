const providers = new Map();

const { resolveProviderCapabilities } = require('./providerContract');

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
  return Array.from(providers.values()).map((provider) => ({
    id: provider.id,
    label: provider.label,
    capabilities: resolveProviderCapabilities(provider),
  }));
}

function describeProvider(id, context = {}) {
  const provider = getProvider(id);
  if (!provider) return null;
  return {
    id: provider.id,
    label: provider.label,
    capabilities: resolveProviderCapabilities(provider, context),
  };
}

module.exports = {
  describeProvider,
  getProvider,
  listProviders,
  registerProvider,
};
