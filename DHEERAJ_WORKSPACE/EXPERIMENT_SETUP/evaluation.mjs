// The experiment's existing evaluation, shared by live tools and offline replay.
//
// pilot_match / solved use E_plane (terminalMatch), the relation every reported result was
// scored under. When the target layers carry original-sheet polygons (`sheet`, e.g. from
// sessionLayers on a replayed reference), the identity-aware relation E_id is reported
// alongside as terminal_identity_match; it is null when the target carries no sheet data.
import {terminalMatch, identityTerminalMatch, sessionLayers, TERMINAL_METRIC, IDENTITY_TERMINAL_METRIC}
  from './terminal_match.mjs';

export function evaluateSession(session, targetLayers) {
  const cp = session.evaluate(), terminal = terminalMatch(session.layers, targetLayers);
  const hasSheets = targetLayers.length && targetLayers.every(l => Array.isArray(l.sheet));
  const identity = hasSheets ? identityTerminalMatch(sessionLayers(session), targetLayers) : null;
  return {...cp, terminal_reference_match: terminal, pilot_match: cp.cp_match && terminal,
    terminal_identity_match: identity,
    identity_match: identity === null ? null : cp.cp_match && identity,
    terminal_metric: TERMINAL_METRIC,
    ...(hasSheets ? {identity_metric: IDENTITY_TERMINAL_METRIC} : {})};
}
