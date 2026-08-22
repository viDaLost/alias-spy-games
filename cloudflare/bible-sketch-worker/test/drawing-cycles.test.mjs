import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAWING_CYCLES,
  beginNextDrawingCycle,
  currentDrawingCycle,
  isLastTurnOfDrawingCycle,
  withDrawingCycleMeta,
} from '../src/drawing-cycles.js';

function makeState(overrides = {}) {
  return {
    status: 'drawing',
    version: 4,
    updatedAt: 0,
    drawingCycle: 1,
    turnOrder: ['p1', 'p2', 'p3'],
    turnIndex: 2,
    turnDeadlineMs: 0,
    spyVotes: { p1: 'p2' },
    guessReview: { text: 'draft' },
    log: [],
    ...overrides,
  };
}

test('Bible Sketch uses two complete drawing cycles', () => {
  assert.equal(DRAWING_CYCLES, 2);
  const state = makeState();
  assert.equal(isLastTurnOfDrawingCycle(state, 'p3'), true);
  assert.equal(beginNextDrawingCycle(state, 1_000), true);
  assert.equal(state.status, 'drawing');
  assert.equal(state.drawingCycle, 2);
  assert.equal(state.turnIndex, 0);
  assert.equal(state.turnDeadlineMs, 41_000);
  assert.deepEqual(state.spyVotes, {});
  assert.equal(state.guessReview, null);
  assert.match(state.log.at(-1), /Круг рисования 2 из 2/);
});

test('second cycle does not loop into a third cycle', () => {
  const state = makeState({ drawingCycle: 2 });
  assert.equal(currentDrawingCycle(state), 2);
  assert.equal(isLastTurnOfDrawingCycle(state, 'p3'), false);
  assert.equal(beginNextDrawingCycle(state, 1_000), false);
  assert.equal(state.turnIndex, 2);
});

test('only the active last drawer may finish the first cycle', () => {
  const state = makeState();
  assert.equal(isLastTurnOfDrawingCycle(state, 'p2'), false);
  state.turnIndex = 1;
  assert.equal(isLastTurnOfDrawingCycle(state, 'p2'), false);
});

test('cycle metadata expands client turn progress across both cycles', () => {
  const state = makeState({ drawingCycle: 2, turnIndex: 1 });
  const view = withDrawingCycleMeta({ status: 'drawing', turnIndex: 1, turnCount: 3 }, state);
  assert.equal(view.drawingCycle, 2);
  assert.equal(view.drawingCycles, 2);
  assert.equal(view.turnIndex, 4);
  assert.equal(view.turnCount, 6);
});
