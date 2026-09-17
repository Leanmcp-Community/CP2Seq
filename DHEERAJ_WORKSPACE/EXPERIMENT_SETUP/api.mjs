export function resolveProfile(name, profile, env = process.env) {
  if (!profile) throw Error(`Unknown profile: ${name}`);
  const model = profile.model_env ? env[profile.model_env] : profile.model;
  const base = profile.base_url_env ? env[profile.base_url_env] : profile.base_url;
  if (!model || !base) throw Error(`${name}: set ${profile.model_env || 'model'} and ${profile.base_url_env || 'base_url'}`);
  const url = new URL(base.replace(/\/$/, '') + '/chat/completions');
  if (url.username || url.password || url.search || url.hash) throw Error('Keep credentials out of base URLs');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw Error('Use HTTPS or a loopback SSH tunnel for the API');
  }
  const key = env[profile.key_env];
  if (!key) throw Error(`${name}: set ${profile.key_env}`);
  const extra = profile.extra_body || {};
  for (const field of ['model', 'messages', 'temperature', 'max_tokens', 'stream', 'tools', 'tool_choice']) {
    if (field in extra) throw Error(`extra_body cannot override ${field}`);
  }
  return {name, ...profile, model, endpoint: url.href, key};
}

export function payload(profile, messages, maxTokens) {
  return {model: profile.model, messages, temperature: 0, max_tokens: maxTokens, stream: false, ...profile.extra_body};
}

export function normalizeResponse(body) {
  const choice = body.choices?.[0];
  if (!choice?.message) throw Error('Response has no choices[0].message');
  const message = choice.message;
  let content = typeof message.content === 'string' ? message.content :
    Array.isArray(message.content) ? message.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : '';
  let thinking = message.reasoning_content ?? message.reasoning ?? null;
  // A reasoning-only response is never executable. Only parse the final answer.
  const match = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (match) { thinking ??= match[1]; content = match[2]; }
  if (/<think>/.test(content)) content = '';
  return {content, thinking, finish: choice.finish_reason ?? null, usage: body.usage ?? null,
    provider_tool_calls: message.tool_calls ?? []};
}

export async function request(profile, body, timeoutMs, fetchImpl = fetch) {
  const started = performance.now();
  try {
    const response = await fetchImpl(profile.endpoint, {
      method: 'POST', redirect: 'error',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${profile.key}`},
      body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
    const raw = await response.text();
    return {status: response.status, ok: response.ok, raw,
      latency_ms: performance.now() - started, request_id: response.headers.get('x-request-id')};
  } catch (e) {
    return {status: null, ok: false, raw: null, latency_ms: performance.now() - started,
      error: e.name === 'TimeoutError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR'};
  }
}
