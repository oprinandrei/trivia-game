import { Category, VoteTally } from '../shared/types';

export function pickRandomCategories(all: Category[], count: number, exclude: Set<number>): Category[] {
  let pool = all.filter((c) => !exclude.has(c.id));
  if (pool.length < count) pool = all.slice();
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function tallyVotes(votes: Map<string, number>): VoteTally {
  const tally: VoteTally = {};
  for (const categoryId of votes.values()) {
    tally[categoryId] = (tally[categoryId] || 0) + 1;
  }
  return tally;
}

export function pickWinningCategory(tally: VoteTally, candidates: Category[]): Category {
  const entries = Object.entries(tally);
  if (entries.length === 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const maxVotes = Math.max(...entries.map(([, count]) => count));
  const winnerIds = entries.filter(([, count]) => count === maxVotes).map(([id]) => Number(id));
  const winnerId = winnerIds[Math.floor(Math.random() * winnerIds.length)];
  return candidates.find((c) => c.id === winnerId) ?? candidates[0];
}
