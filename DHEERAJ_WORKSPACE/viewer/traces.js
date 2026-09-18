const $ = id => document.getElementById(id);
const pretty = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
function node(tag, text, parent) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  parent?.append(el); return el;
}
async function fetchFile(url, kind = 'json', optional = false) {
  const r = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
  if (optional && r.status === 404) return null;
  if (!r.ok) throw Error(`Trace request failed (${r.status}): ${await r.text()}`);
  if (kind === 'text') return r.text();
  const raw = await r.text();
  if (kind === 'jsonl') return raw.split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return [{partial_line: line}]; }
  });
  try { return JSON.parse(raw); } catch { return null; }
}
function url(run, path) { return '/api/trace-file?' + new URLSearchParams({run: run.id, path}); }
function link(parent, run, path, label = path) {
  const a = node('a', label, parent); a.href = url(run, path); a.target = '_blank'; a.rel = 'noopener';
}
function block(parent, title, value, open = true) {
  const d = node('details', undefined, parent); d.open = open;
  node('summary', title, d); node('pre', value == null ? 'Not recorded yet.' : pretty(value), d); return d;
}
function badge(parent, text, tone = '') {
  const el = node('span', text, parent); el.className = 'badge' + (tone ? ' ' + tone : ''); return el;
}
function images(parent, run, manifest) {
  const group = node('div', undefined, parent); group.className = 'trace-images';
  for (const [label, info] of Object.entries(manifest || {})) {
    let path = info.path || info.image_path;
    if (!path) continue;
    if (path.startsWith(run.directory + '/')) path = path.slice(run.directory.length + 1);
    else if (path.includes(run.id + '/')) path = path.slice(path.lastIndexOf(run.id + '/') + run.id.length + 1);
    if (path.startsWith('/')) { node('p', `${label}: image outside saved run`, group); continue; }
    const fig = node('figure', undefined, group);
    const a = node('a', undefined, fig); a.href = url(run, path); a.target = '_blank'; a.rel = 'noopener';
    const img = node('img', undefined, a); img.src = a.href; img.alt = label; img.loading = 'lazy';
    node('figcaption', label, fig);
  }
}
async function renderTurn(parent, run, sample, turn) {
  const prefix = `${sample.id}/turn-${String(turn).padStart(3, '0')}`;
  const read = (path, kind = 'json') => fetchFile(url(run, path), kind, true);
  const conversation = node('div', undefined, parent); conversation.className = 'turn-rows';
  function row(label) {
    const section = node('section', undefined, conversation); section.className = 'turn-row';
    node('h3', label, section);
    const body = node('div', undefined, section); body.className = 'turn-row-body';
    return body;
  }
  if (sample.layout === 'codex') {
    const [prompt, manifest, response, events, tool, feedback, process, command, stderr] = await Promise.all([
      read(`${prefix}/prompt.md`, 'text'), read(`${prefix}/images.json`), read(`${prefix}/response.json`),
      read(`${prefix}/events.jsonl`, 'jsonl'), read(`${prefix}/tool.json`), read(`${prefix}/feedback-images.json`),
      read(`${prefix}/process.json`), read(`${prefix}/command.json`), read(`${prefix}/stderr.log`, 'text')]);
    block(row('Input · prompt and conversation history'), 'Exact prompt sent to Codex', prompt);
    const pictures = row('Input · attached images'); images(pictures, run, manifest); block(pictures, 'Image manifest', manifest, false);
    const reasoning = (events || []).filter(e => e.type === 'item.completed' && e.item?.type === 'reasoning').map(e => e.item.text).filter(Boolean);
    block(row('Assistant · exposed reasoning summaries'), 'Complete saved summaries', reasoning.length ? reasoning.join('\n\n') : 'No reasoning summary was exposed in these logs. Private reasoning is not available.');
    const output = row('Assistant · final response'); block(output, 'Response', response);
    const messages = (events || []).filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text);
    if (messages.length) block(output, 'All completed assistant messages', messages, false);
    block(row('Simulator · action and result'), 'Full tool record', tool);
    images(row('Simulator · feedback images'), run, feedback || tool?.result?.image_artifacts);
    const diagnostics = row('CLI · settings, usage, errors, events');
    block(diagnostics, 'Process status', process, false); block(diagnostics, 'Exact command', command, false);
    block(diagnostics, 'Complete CLI event stream', events, false); block(diagnostics, 'stderr', stderr, false);
    const files = node('div', undefined, diagnostics); files.className = 'artifact-links';
    for (const file of ['prompt.md', 'response.json', 'events.jsonl', 'tool.json', 'stderr.log']) link(files, run, `${prefix}/${file}`, file);
  } else {
    const [messages, request, parsed, response, tool, chunks] = await Promise.all(['messages', 'request', 'parsed', 'response', 'tool', 'prompt'].map(name => read(`${prefix}-${name}.json`)));
    const input = row('Input · full conversation');
    for (const [i, message] of (messages || []).entries()) {
      block(input, `${i + 1}. ${message.role}${message.name ? ' · ' + message.name : ''}`, message);
      for (const part of Array.isArray(message.content) ? message.content : []) if (part.type === 'image') images(input, run, {image: part.image || {}});
    }
    if (!messages) node('p', 'Conversation snapshot not recorded yet.', input);
    const uploaded = row('Input · encoded prompt and uploaded images');
    for (const chunk of Array.isArray(chunks) ? chunks : []) {
      if (chunk.type === 'image') images(uploaded, run, {image: chunk});
      else block(uploaded, 'Prompt chunk', chunk.text ?? chunk, false);
    }
    block(row('Assistant · recorded thinking'), 'Full thinking', parsed?.thinking || 'No separate thinking block recorded.');
    block(row('Assistant · output and requested actions'), 'Parsed response', parsed);
    block(row('Assistant · raw response'), 'Complete response', response);
    block(row('Simulator · action and result'), 'Full tool record', tool);
    images(row('Simulator · feedback images'), run, tool?.result?.image_artifacts);
    block(row('Sampling settings'), 'Request', request, false);
  }
}
const STORAGE = 'origami-trace-panels-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch { saved = {}; }
const state = {run: null, locations: {}, sidebarClosed: false, scroll: {}, expanded: {}, live: true, ...saved};
let currentRun = null, busy = false, ticket = 0, conversationSignature = '', lastRuns = [];
function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch {} }
function location() { return state.locations[state.run] ||= {sample: null, turn: null}; }
function context(panel) {
  const loc = state.run ? location() : {};
  const deep = panel === 'conversation' || panel === 'turns';
  return [panel, panel === 'runs' ? '' : state.run, deep ? loc.sample : '', panel === 'conversation' ? loc.turn : ''].join('/');
}
function rememberScroll() {
  for (const panel of ['runs', 'examples', 'turns', 'conversation']) {
    const body = $(`${panel}-body`);
    if (body?.dataset.locationKey) state.scroll[body.dataset.locationKey] = body.scrollTop;
  }
  persist();
}
function restoreScroll(panel) {
  const key = context(panel);
  const body = $(`${panel}-body`);
  body.dataset.locationKey = key;
  requestAnimationFrame(() => { if (context(panel) === key) body.scrollTop = state.scroll[key] || 0; });
}
const narrow = () => window.matchMedia('(max-width: 980px)').matches;
function applySidebar() {
  const closed = !!state.sidebarClosed;
  document.body.classList.toggle('sidebar-collapsed', closed);
  const toggle = $('sidebar-toggle');
  toggle.setAttribute('aria-expanded', String(!closed));
  $('sidebar').inert = closed;
}
function toggleSidebar(force) {
  rememberScroll();
  state.sidebarClosed = force === undefined ? !state.sidebarClosed : !force;
  applySidebar(); persist();
}
function fail(e) { $('trace-error').hidden = false; $('trace-error').textContent = e.message || String(e); }
function bindDetails(parent) {
  const base = context('conversation');
  const counts = {};
  for (const d of parent.querySelectorAll('details')) {
    const title = d.querySelector(':scope > summary')?.textContent || '';
    const n = counts[title] || 0; counts[title] = n + 1;
    const key = `${base}/${title}/${n}`;
    if (Object.hasOwn(state.expanded, key)) d.open = state.expanded[key];
    d.addEventListener('toggle', () => { state.expanded[key] = d.open; persist(); });
  }
}
function listRow(parent, {title, meta = [], status, chosen, action}) {
  const b = node('button', undefined, parent);
  b.className = 'row-item';
  b.type = 'button';
  b.setAttribute('aria-current', String(!!chosen));
  node('span', title, b).className = 'row-title';
  if (status || meta.length) {
    const line = node('span', undefined, b); line.className = 'row-meta';
    if (status) badge(line, status.text, status.tone);
    meta.filter(Boolean).forEach(text => node('span', text, line));
  }
  b.onclick = action;
  return b;
}
function outcome(sample) {
  if (sample.error) return {text: 'Error', tone: 'bad'};
  if (!sample.result) return {text: 'Running', tone: ''};
  return sample.result.solved ? {text: 'Solved', tone: 'ok'} : {text: 'Unsolved', tone: 'warn'};
}
const matches = (value, query) => !query || String(value ?? '').toLowerCase().includes(query);
function renderRuns(runs = lastRuns) {
  lastRuns = runs;
  const parent = $('runs-body'); parent.replaceChildren();
  const query = $('runs-filter').value.trim().toLowerCase();
  const visible = runs.filter(run => matches(run.id, query) || matches(run.model, query));
  $('runs-count').textContent = visible.length === runs.length ? String(runs.length) : `${visible.length}/${runs.length}`;
  if (!visible.length) { node('p', runs.length ? 'No run matches this filter.' : 'No saved runs yet.', parent).className = 'note'; return; }
  const list = node('div', undefined, parent); list.className = 'row-list';
  for (const run of visible) listRow(list, {
    title: run.id,
    meta: [run.model],
    chosen: run.id === state.run,
    action: () => selectRun(run.id).catch(fail),
  });
  restoreScroll('runs');
}
function renderExamples() {
  const parent = $('examples-body'); parent.replaceChildren();
  if (!currentRun) {
    $('examples-title').textContent = 'Examples';
    $('examples-count').textContent = '';
    node('p', 'Select a run.', parent).className = 'note';
    return;
  }
  const config = currentRun.config?.config || currentRun.config || {};
  $('examples-title').textContent = 'Examples';
  const query = $('examples-filter').value.trim().toLowerCase();
  const samples = currentRun.samples || [];
  const visible = samples.filter(sample => matches(sample.id, query) || matches(outcome(sample).text, query));
  $('examples-count').textContent = visible.length === samples.length ? String(samples.length) : `${visible.length}/${samples.length}`;
  if (!samples.length) node('p', 'No examples saved yet.', parent).className = 'note';
  else if (!visible.length) node('p', 'No example matches this filter.', parent).className = 'note';
  else {
    const list = node('div', undefined, parent); list.className = 'row-list';
    for (const sample of visible) listRow(list, {
      title: sample.id,
      status: outcome(sample),
      meta: [`${sample.turns.length} turn${sample.turns.length === 1 ? '' : 's'}`],
      chosen: sample.id === location().sample,
      action: () => selectSample(sample.id).catch(fail),
    });
  }
  const footer = node('div', undefined, parent); footer.className = 'rail-footer';
  block(footer, `Run configuration${config.model ? ' · ' + config.model : ''}`, config, false);
  const links = node('div', undefined, footer); links.className = 'artifact-links';
  for (const file of currentRun.files) link(links, currentRun, file);
  restoreScroll('examples');
}
function renderTurns() {
  const parent = $('turns-body'); parent.replaceChildren();
  const sample = currentRun?.samples.find(s => s.id === location().sample);
  const turns = sample?.turns || [];
  $('turns-count').textContent = turns.length ? String(turns.length) : '';
  if (!turns.length) { node('p', sample ? 'No turn saved yet.' : '—', parent).className = 'note'; return; }
  const list = node('div', undefined, parent); list.className = 'row-list';
  for (const turn of turns) listRow(list, {
    title: `Turn ${turn}`,
    chosen: Number(location().turn) === turn,
    action: () => selectTurn(turn).catch(fail),
  });
  restoreScroll('turns');
}
async function selectRun(id) {
  rememberScroll(); state.run = id; currentRun = null; conversationSignature = '';
  renderRuns(); persist();
  await loadSelected(true);
}
async function selectSample(id) {
  rememberScroll(); location().sample = id; conversationSignature = '';
  if (narrow()) toggleSidebar(false);
  renderExamples(); await renderConversation(true);
}
async function selectTurn(turn) {
  rememberScroll(); location().turn = Number(turn); conversationSignature = ''; persist();
  await renderConversation(true);
}
function stepTurn(delta) {
  const sample = currentRun?.samples.find(s => s.id === location().sample);
  if (!sample) return;
  const pos = sample.turns.indexOf(Number(location().turn)) + delta;
  if (pos >= 0 && pos < sample.turns.length) selectTurn(sample.turns[pos]).catch(fail);
}
async function renderConversation(force = false) {
  if (!currentRun) return;
  const run = currentRun, loc = location(), sample = run.samples.find(s => s.id === loc.sample);
  const meta = $('conversation-meta'); meta.replaceChildren();
  if (!sample) {
    $('conversation-title').textContent = 'Conversation';
    node('span', run.id, meta);
    renderTurns();
    const parent = $('conversation-body'); parent.replaceChildren();
    $('conversation-toolbar').replaceChildren();
    node('p', 'Select an example to open its conversation.', parent).className = 'note';
    if (run.legacy_image) block(parent, 'Single-image input and response', run.legacy_image);
    return;
  }
  if (!sample.turns.includes(Number(loc.turn))) loc.turn = sample.turns[0] || null;
  const signature = JSON.stringify([run.id, sample.id, loc.turn, sample.modified]);
  if (!force && signature === conversationSignature) return;
  const renderTicket = ++ticket;
  $('conversation-title').textContent = sample.id;
  const status = outcome(sample);
  badge(meta, status.text, status.tone);
  node('span', run.id, meta);
  node('span', `${sample.turns.length} turn${sample.turns.length === 1 ? '' : 's'}`, meta);
  renderTurns();
  const toolbar = $('conversation-toolbar'); toolbar.replaceChildren();
  node('span', `Turn ${loc.turn ?? '—'} of ${sample.turns.length}`, toolbar).className = 'turn-picker';
  for (const [text, delta] of [['← Prev', -1], ['Next →', 1]]) {
    const b = node('button', text, toolbar), pos = sample.turns.indexOf(Number(loc.turn)) + delta;
    b.disabled = pos < 0 || pos >= sample.turns.length;
    b.onclick = () => selectTurn(sample.turns[pos]).catch(fail);
  }
  node('span', undefined, toolbar).className = 'spacer';
  for (const [text, open] of [['Collapse all', false], ['Expand all', true]]) {
    const b = node('button', text, toolbar);
    b.onclick = () => $('conversation-body').querySelectorAll('details').forEach(d => { d.open = open; });
  }
  const body = document.createElement('div');
  if (sample.result) block(body, 'Episode result', sample.result, false);
  if (sample.error) block(body, 'Episode error', sample.error, true);
  if (loc.turn) await renderTurn(body, run, sample, Number(loc.turn));
  else node('p', 'No model turn saved yet.', body);
  if (renderTicket !== ticket || state.run !== run.id || location().sample !== sample.id) return;
  bindDetails(body);
  $('conversation-body').replaceChildren(body);
  conversationSignature = signature; restoreScroll('conversation'); persist();
}
async function loadSelected(force = false) {
  const id = state.run; if (!id) return;
  const data = await fetchFile('/api/trace?' + new URLSearchParams({run: id}));
  if (state.run !== id) return;
  currentRun = data; renderExamples(); await renderConversation(force);
}
async function refresh(force = false) {
  if (busy) return; busy = true;
  try {
    rememberScroll();
    const listing = await fetchFile('/api/traces');
    $('trace-status').textContent = `${listing.runs.length} saved run${listing.runs.length === 1 ? '' : 's'}`;
    $('trace-error').hidden = !listing.errors.length; $('trace-error').textContent = listing.errors.join('\n');
    if (state.run && !listing.runs.some(r => r.id === state.run)) { state.run = null; currentRun = null; }
    renderRuns(listing.runs);
    await loadSelected(force);
  } catch (e) { fail(e); }
  finally { busy = false; }
}
$('sidebar-toggle').onclick = () => toggleSidebar();
$('runs-filter').oninput = () => renderRuns();
$('examples-filter').oninput = () => renderExamples();
for (const name of ['runs', 'examples', 'turns', 'conversation']) $(`${name}-body`).addEventListener('scroll', () => {
  const body = $(`${name}-body`);
  if (body.dataset.locationKey) state.scroll[body.dataset.locationKey] = body.scrollTop;
  persist();
}, {passive: true});
document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.key === '[' || event.key === ']') { toggleSidebar(); event.preventDefault(); }
  else if (event.key === 'ArrowLeft' || event.key === 'k') stepTurn(-1);
  else if (event.key === 'ArrowRight' || event.key === 'j') stepTurn(1);
});
$('live').checked = state.live;
$('live').onchange = () => { state.live = $('live').checked; persist(); };
$('refresh').onclick = () => refresh(true);
window.addEventListener('pagehide', rememberScroll);
applySidebar();
setInterval(() => { if (state.live && !document.hidden) refresh(); }, 5000);
refresh(true);
