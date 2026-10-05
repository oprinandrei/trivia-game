export const MAX_POINTS = 10;

/** Rank-based scoring: the fastest correct answer (rank 0) scores MAX_POINTS,
 * each slower correct answer scores one less, down to a floor of 1 point for
 * every correct answer once the countdown from MAX_POINTS is exhausted. */
export function pointsForRank(rank: number): number {
  return Math.max(MAX_POINTS - rank, 1);
}
