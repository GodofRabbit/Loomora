export const DEFAULT_ENDPOINT = 'https://www.zexitongxue.com';
export const API_KEY_STORAGE = 'loomora-key';
export const ENDPOINT_STORAGE = 'loomora-endpoint';

export const modelOptions = [
  { value: 'gpt-image-2', label: 'GPT Image 2', maxCount: 14 },
  {
    value: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    maxCount: 4,
  },
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    maxCount: 4,
  },
  { value: 'grok-imagine-image', label: 'Grok Imagine Image', maxCount: 1 },
  {
    value: 'grok-imagine-image-pro',
    label: 'Grok Imagine Image Pro',
    maxCount: 1,
  },
  {
    value: 'grok-imagine-image-lite',
    label: 'Grok Imagine Image Lite',
    maxCount: 1,
  },
  {
    value: 'grok-imagine-image-edit',
    label: 'Grok Imagine Image Edit',
    maxCount: 3,
  },
];

export const gptRatios = ['1:1', '16:9', '9:16', '3:2', '2:3'];
export const geminiRatios = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
];
export const grokRatios = ['1:1', '16:9', '9:16'];
export const gptSizes = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1:1' },
  { value: '1536x1024', label: '3:2' },
  { value: '1024x1536', label: '2:3' },
  { value: '2048x1152', label: '16:9（2K）' },
  { value: '3840x2160', label: '16:9（4K）' },
  { value: '2160x3840', label: '9:16（4K）' },
];

export const modelAliases = {
  'dall-e': 'gpt-image-2',
  'dall-e-2': 'gpt-image-2',
  'dall-e-3': 'grok-imagine-image-pro',
  'nano-banana': 'gemini-3.1-flash-image-preview',
  'nano-banana2': 'gemini-3.1-flash-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'grok-imagine-image-quality': 'grok-imagine-image-pro',
};
