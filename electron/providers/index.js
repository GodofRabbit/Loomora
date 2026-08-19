const {
  describeProvider,
  getProvider,
  listProviders,
  registerProvider,
} = require('./providerRegistry');
const { openAiCompatibleProvider } = require('./openaiCompatibleProvider');
const { replicateProvider } = require('./replicateProvider');

registerProvider(openAiCompatibleProvider);
registerProvider(replicateProvider);

module.exports = { describeProvider, getProvider, listProviders };
