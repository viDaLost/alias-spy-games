// Only bounded gameplay progress is accepted from the World client.
export function worldPresence(game, value) {
  if (game !== 'bible-world' || !value || typeof value !== 'object') return null;
  if (!['menu', 'playing', 'results', 'finished'].includes(value.phase)) return null;
  if (value.phase === 'menu') return {phase:'menu'};
  if (!['easy','medium','hard'].includes(value.level)) return null;
  const number = (raw, max) => Math.max(0, Math.min(max, Math.trunc(Number(raw) || 0)));
  const rounds = number(value.rounds,100);
  return {phase:value.phase,level:value.level,round:number(value.round,rounds),rounds,
    single:value.single===true,score:number(value.score,500_000),maxScore:number(value.maxScore,500_000),
    hints:number(value.hints,3)};
}
