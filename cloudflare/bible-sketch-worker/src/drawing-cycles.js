export const DRAWING_CYCLES = 2;
export const DRAW_TURN_MS = 40_000;

export function currentDrawingCycle(state) {
  const raw = Number(state?.drawingCycle || 1);
  return Math.max(1, Math.min(DRAWING_CYCLES, Number.isFinite(raw) ? raw : 1));
}

export function isLastTurnOfDrawingCycle(state, actorId = '') {
  if (!state || state.status !== 'drawing') return false;
  const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
  if (!order.length) return false;
  const index = Number(state.turnIndex || 0);
  if (index < order.length - 1) return false;
  if (actorId && order[index] !== actorId) return false;
  return currentDrawingCycle(state) < DRAWING_CYCLES;
}

export function beginNextDrawingCycle(state, now = Date.now(), reason = '') {
  if (!isLastTurnOfDrawingCycle(state)) return false;
  const nextCycle = currentDrawingCycle(state) + 1;
  state.drawingCycle = nextCycle;
  state.turnIndex = 0;
  state.turnDeadlineMs = now + DRAW_TURN_MS;
  state.status = 'drawing';
  state.spyVotes = {};
  state.guessReview = null;
  state.version = Number(state.version || 0) + 1;
  state.updatedAt = now;
  if (!Array.isArray(state.log)) state.log = [];
  const suffix = reason ? ` · ${reason}` : '';
  state.log.push(`Круг рисования ${nextCycle} из ${DRAWING_CYCLES}${suffix}`);
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
  return true;
}

export function ensureDrawingCycle(state) {
  if (!state) return state;
  if (state.status === 'drawing' && !Number(state.drawingCycle)) state.drawingCycle = 1;
  return state;
}

export function withDrawingCycleMeta(view, state) {
  if (!view || typeof view !== 'object') return view;
  const cycle = state?.status === 'drawing' || Number(state?.drawingCycle)
    ? currentDrawingCycle(state)
    : 0;
  const turnsPerCycle = Math.max(0, Number(view.turnCount || 0));
  const localTurnIndex = Math.max(0, Number(view.turnIndex || 0));
  const exposeExpandedTurns = cycle > 0 && turnsPerCycle > 0;

  return {
    ...view,
    drawingCycle: cycle,
    drawingCycles: DRAWING_CYCLES,
    turnIndex: exposeExpandedTurns
      ? ((cycle - 1) * turnsPerCycle) + localTurnIndex
      : view.turnIndex,
    turnCount: exposeExpandedTurns
      ? turnsPerCycle * DRAWING_CYCLES
      : view.turnCount,
  };
}
