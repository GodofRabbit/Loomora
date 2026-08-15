export const API_KEY_STORAGE = 'loomora-key';
export const ENDPOINT_STORAGE = 'loomora-endpoint';
export const OPENAI_API_BASE = 'https://api.openai.com';
export const DEFAULT_ENDPOINT = OPENAI_API_BASE;
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_PROMPT_LIMIT = 800;
export const promptLimits = {
  [OPENAI_IMAGE_MODEL]: 4000,
};

export const modelOptions = [
  { value: OPENAI_IMAGE_MODEL, label: 'GPT Image 2', maxCount: 10 },
];

export const gptRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
export const geminiRatios = gptRatios;
export const grokRatios = gptRatios;
export const gptSizes = [
  { value: 'auto', label: '按比例自动' },
  { value: '1024x1024', label: '1:1' },
  { value: '2048x2048', label: '1:1（2K）' },
  { value: '2048x1152', label: '16:9（2K）' },
  { value: '3840x2160', label: '16:9（4K）' },
  { value: '1152x2048', label: '9:16（2K）' },
  { value: '2160x3840', label: '9:16（4K）' },
  { value: '1536x1152', label: '4:3' },
  { value: '1152x1536', label: '3:4' },
  { value: '1536x1024', label: '3:2' },
  { value: '1024x1536', label: '2:3' },
];

export const modelAliases = {
  'dall-e': OPENAI_IMAGE_MODEL,
  'dall-e-2': OPENAI_IMAGE_MODEL,
};
