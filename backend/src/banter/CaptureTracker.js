// Match-local accounting derived exclusively from the engine's accepted capture list.
export function trackCaptures(state, event) {
  state.captures ??= {};
  state.debts ??= {};
  state.revengeCounts ??= {};
  const revenges = [];
  for (const capture of event.captures ?? []) {
    const hunter = event.playerId,
      victim = capture.playerId;
    if (hunter === victim) continue;
    state.captures[hunter] ??= {};
    state.debts[hunter] ??= {};
    state.debts[victim] ??= {};
    if ((state.debts[hunter][victim] ?? 0) > 0) {
      state.debts[hunter][victim]--;
      state.revengeCounts[hunter] = (state.revengeCounts[hunter] ?? 0) + 1;
      revenges.push(victim);
    }
    state.captures[hunter][victim] = (state.captures[hunter][victim] ?? 0) + 1;
    state.debts[victim][hunter] = (state.debts[victim][hunter] ?? 0) + 1;
  }
  return [...new Set(revenges)];
}
