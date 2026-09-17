const $ = id => document.getElementById(id);
let index = null, generation = 0, signature = '', refreshing = false;
const pretty = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
function node(tag, text, parent) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  parent?.append(element); return element;
}
function error(message) { $('trace-error').hidden = !message; $('trace-error').textContent = message || ''; }
async function request(url, optional = false) {
  const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
  if (optional && response.status === 404) return null;
  if (!response.ok) throw Error(`Could not read trace (${response.status}): ${await response.text()}`);
  return response.json();
}
function artifactUrl(path) {
  return '/api/trace-file?' + new URLSearchParams({run: index.id, path});
}
function relativePath(path) {
  if (path.startsWith(index.directory + '/')) return path.slice(index.directory.length + 1);
  // Preserve readability when a run folder has been moved to another machine.
  const marker = index.id + '/', at = path.lastIndexOf(marker);
  if (at >= 0) return path.slice(at + marker.length);
  return path.startsWith('/') ? null : path;
}
function artifactLink(parent, label, path) {
  const a = node('a', label, parent); a.href = artifactUrl(path); a.target = '_blank'; a.rel = 'noopener';
  return a;
}
function details(parent, title, value, open = false) {
  const d = node('details', undefined, parent); d.open = open;
  node('summary', title, d); node('pre', pretty(value), d); return d;
}
function card(parent, title) {
  const a = node('article', undefined, parent); node('h2', title, a); return a;
}
function image(parent, path, label = 'Image') {
  const relative = relativePath(path);
  if (!relative) { node('p', `${label}: original image was not copied into this run.`, parent); return; }
  const figure = node('figure', undefined, parent), a = artifactLink(figure, '', relative);
  const img = node('img', undefined, a); img.src = artifactUrl(relative); img.alt = label; img.loading = 'lazy';
  img.onerror = () => { img.hidden = true; caption.textContent = `${label}: saved image unavailable`; };
  const caption = node('figcaption', label, figure);
}
function renderMessage(parent, message, i) {
  const d = node('details', undefined, parent);
  node('summary', `${i + 1}. ${message.role}${message.name ? ' · ' + message.name : ''}`, d);
  const content = message.content;
  if (typeof content === 'string') node('pre', content, d);
  else for (const part of content || []) {
    if (part.type === 'image') {
      const group = node('div', undefined, d); group.className = 'trace-images';
      const path = part.image?.image_path;
      if (path) image(group, path, 'Model input image');
      else node('pre', pretty(part), d);
    } else node('pre', part.text ?? part.thinking ?? pretty(part), d);
  }
  if (message.tool_calls?.length) details(d, 'Tool calls', message.tool_calls, true);
}
function options(id, rows, selected) {
  const select = $(id); select.replaceChildren();
  for (const [value, title] of rows) {
    const option = node('option', title, select); option.value = String(value);
  }
  if (rows.some(r => String(r[0]) === String(selected))) select.value = selected;
  select.disabled = rows.length === 0;
}
async function displayTurn(force = false) {
  const sample = index?.samples.find(s => s.id === $('trace-sample').value);
  const turn = Number($('trace-turn').value);
  const nextSignature = JSON.stringify([index?.id, sample?.id, sample?.modified, turn, index?.legacy_image]);
  if (!force && signature === nextSignature) return;
  const ticket = ++generation;
  const body = document.createElement('div');
  if (!sample) {
    if (index?.legacy_image) {
      const saved = index.legacy_image;
      const input = card(body, 'Single-image input'); node('pre', saved.question || '', input);
      const group = node('div', undefined, input); group.className = 'trace-images';
      image(group, 'input.png', 'Prepared image (available in newer runs)');
      node('pre', saved.text || '', card(body, 'Model output'));
      details(body, 'Full saved response and tokens', saved);
    } else node('p', 'Run created; waiting for the first example or turn.', body);
  } else {
    if (sample.error) details(body, 'Episode error', sample.error, true);
    if (sample.result) details(body, 'Episode result', sample.result, true);
    if (turn) {
      const prefix = `${sample.id}/turn-${String(turn).padStart(3, '0')}`;
      const names = ['messages', 'request', 'parsed', 'response', 'tool'];
      const records = await Promise.all(names.map(name => request(artifactUrl(`${prefix}-${name}.json`), true)));
      if (ticket !== generation) return;
      const [messages, req, parsed, response, tool] = records;
      const stats = card(body, `Turn ${turn}`);
      if (parsed?.repetition) details(stats, 'Stopped: repetition detected; no tools executed from this response', parsed.repetition, true);
      node('p', parsed ? `${parsed.prompt_tokens} input tokens · ${parsed.completion_tokens} output tokens · ${parsed.duration_s.toFixed(1)}s · ${parsed.stop_reason}` : 'Waiting for model response…', stats);
      if (req) details(stats, 'Sampling settings', req);
      const input = card(body, 'Model input — full conversation');
      if (messages) messages.forEach((m, i) => renderMessage(input, m, i));
      else node('p', 'Input snapshot is not available yet.', input);
      const thinking = card(body, 'Model-emitted thinking');
      if (parsed?.thinking_complete === false) node('p', 'Thinking was cut off by the output-token limit; this partial output was saved and no tool was executed.', thinking);
      node('pre', parsed?.thinking || 'No separate thinking block recorded. Older runs disabled thinking; truncated or unparsed output remains available below.', thinking);
      const output = card(body, 'Model output');
      node('pre', parsed?.content || (response ? 'No separate text response; inspect tool calls or raw output.' : 'Waiting…'), output);
      if (parsed?.message?.tool_calls?.length) details(output, 'Requested tools', parsed.message.tool_calls, true);
      if (response) {
        details(output, 'Raw model output (including tags)', response.raw_text || '', true);
        artifactLink(output, 'Open complete response, token IDs and log probabilities', `${prefix}-response.json`);
      }
      if (tool) {
        const result = card(body, 'Executed tool and result');
        details(result, 'Call', tool.call || tool.calls, true);
        details(result, 'Result', tool.result || tool.results, true);
        const group = node('div', undefined, result); group.className = 'trace-images';
        for (const [name, info] of Object.entries(tool.result?.image_artifacts || {})) image(group, info.path, name);
      }
      const exact = card(body, 'Exact input tokens and uploaded images');
      artifactLink(exact, 'Open full encoded prompt record', `${prefix}-prompt.json`);
      const d = node('details', undefined, exact); node('summary', 'Load decoded prompt chunks and wire images', d);
      let loaded = false;
      d.addEventListener('toggle', async () => {
        if (!d.open || loaded) return; loaded = true;
        try {
          const chunks = await request(artifactUrl(`${prefix}-prompt.json`), true);
          if (!chunks) { node('p', 'Prompt has not been encoded yet.', d); loaded = false; return; }
          for (const chunk of chunks) {
            if (chunk.type === 'image') {
              const group = node('div', undefined, d); group.className = 'trace-images';
              image(group, chunk.path, `Uploaded image · ${chunk.bytes} bytes · ${chunk.expected_tokens} tokens`);
            } else node('pre', chunk.text ?? pretty(chunk.tokens), d);
          }
        } catch (e) { node('p', e.message, d); loaded = false; }
      });
    } else node('p', 'Preparing the example; no model turn recorded yet.', body);
  }
  if (ticket !== generation) return;
  const container = $('trace-content'), scroll = container.scrollTop;
  const open = new Set([...container.querySelectorAll('details[open] > summary')].map(el => el.textContent));
  container.replaceChildren(body);
  for (const d of body.querySelectorAll('details')) if (open.has(d.firstElementChild?.textContent)) d.open = true;
  container.scrollTop = scroll;
  signature = nextSignature;
}
async function loadIndex(force = false) {
  const run = $('trace-run').value;
  if (!run) return;
  const data = await request('/api/trace?' + new URLSearchParams({run}));
  if ($('trace-run').value !== run) return;
  index = data;
  options('trace-sample', data.samples.map(s => [s.id, s.id]), $('trace-sample').value);
  const sample = data.samples.find(s => s.id === $('trace-sample').value);
  const selected = $('follow').checked ? sample?.turns.at(-1) : $('trace-turn').value;
  options('trace-turn', (sample?.turns || []).map(t => [t, `Turn ${t}`]), selected);
  const config = data.config?.config || data.config || {};
  $('trace-status').textContent = `${config.model || data.legacy_image?.model || 'Model'} · Thinking: ${config.thinking === undefined ? 'not recorded / older run' : config.thinking ? 'enabled' : 'disabled'}`;
  $('trace-links').replaceChildren();
  for (const file of data.files) artifactLink($('trace-links'), file, file);
  await displayTurn(force);
}
async function refresh(force = false) {
  if (refreshing) return; refreshing = true;
  try {
    const listing = await request('/api/traces');
    options('trace-run', listing.runs.map(r => [r.id, `${r.id} · ${r.model}`]), $('trace-run').value);
    if (!listing.runs.length) $('trace-status').textContent = `No saved runs in ${listing.root}. Start the experiment, then refresh.`;
    error(listing.errors.join('\n'));
    await loadIndex(force);
  } catch (e) { error(e.message); }
  finally { refreshing = false; }
}
const handle = fn => () => Promise.resolve().then(fn).catch(e => error(e.message));
$('refresh').onclick = () => refresh(true);
$('trace-run').onchange = handle(() => { generation++; signature = ''; return loadIndex(true); });
$('trace-sample').onchange = handle(() => loadIndex(true));
$('trace-turn').onchange = handle(() => { $('follow').checked = false; return displayTurn(true); });
for (const [id, delta] of [['prev-turn', -1], ['next-turn', 1]]) $(id).onclick = handle(() => {
  $('follow').checked = false;
  const select = $('trace-turn'); select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + delta));
  return displayTurn(true);
});
setInterval(() => { if ($('live').checked && !document.hidden) refresh(); }, 5000);
refresh();
