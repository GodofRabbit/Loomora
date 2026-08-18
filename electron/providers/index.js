const {
  getProvider,
  listProviders,
  registerProvider,
} = require('./providerRegistry');
const { openAiCompatibleProvider } = require('./openaiCompatibleProvider');

registerProvider(openAiCompatibleProvider);

module.exports = { getProvider, listProviders };
