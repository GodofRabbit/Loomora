const CJK_PATTERN = /[\u3400-\u9fff]/;

const ERROR_RULES = [
  [/invalid api key|api key.*invalid|unauthorized|forbidden/i, 'API 密钥无效或权限不足'],
  [/rate limit|too many requests/i, '请求过于频繁，请稍后重试'],
  [/timed? out|timeout/i, '请求超时，请稍后重试'],
  [/failed to fetch|fetch failed|network|socket|dns|econnrefused|enotfound|econnreset/i, '网络连接异常，请检查网络后重试'],
  [/invalid url/i, '接口地址无效，请检查后重试'],
  [/model.*not found|unsupported model/i, '所选模型不可用'],
  [/content policy|policy violation/i, '提示词未通过安全检查'],
  [/no such file|file not found/i, '文件不存在'],
  [/abort|cancel/i, '操作已取消'],
];

export function formatUserMessage(value, fallback = '操作失败，请稍后重试') {
  const raw =
    typeof value === 'string'
      ? value
      : value?.message || value?.error?.message || '';
  const message = String(raw).trim();
  if (!message) return fallback;
  if (CJK_PATTERN.test(message)) return message;
  const lower = message.toLowerCase();
  for (const [rule, text] of ERROR_RULES) {
    if (rule.test(lower)) return text;
  }
  return fallback;
}
