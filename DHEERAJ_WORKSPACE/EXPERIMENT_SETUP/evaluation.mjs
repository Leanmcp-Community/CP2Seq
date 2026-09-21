// The experiment's existing evaluation, shared by live tools and offline replay.
import {terminalMatch, TERMINAL_METRIC} from './terminal_match.mjs';

export function evaluateSession(session, targetLayers) {
  const cp = session.evaluate(), terminal = terminalMatch(session.layers, targetLayers);
  return {...cp, terminal_reference_match: terminal, pilot_match: cp.cp_match && terminal,
    terminal_metric: TERMINAL_METRIC};
}
