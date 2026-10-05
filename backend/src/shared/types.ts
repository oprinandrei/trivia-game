export type Difficulty = 'easy' | 'medium' | 'hard';
export type AnswerType = 'multiple' | 'boolean' | 'both';
export type QuestionType = 'multiple' | 'boolean';

export type Phase =
  | 'LOBBY'
  | 'CATEGORY_VOTE'
  | 'CATEGORY_RESULT'
  | 'QUESTION_ACTIVE'
  | 'REVEAL'
  | 'ROUND_SUMMARY'
  | 'GAME_END';

export interface GameConfig {
  rounds: number;
  questionsPerRound: number;
  difficulty: Difficulty;
  answerType: AnswerType;
  timeLimitSec: number;
  /** How long the winning category stays on screen before the first question starts. */
  categoryResultTimeSec: number;
  /** Countdown shown after a question's reveal, before the next question starts. */
  revealTimeSec: number;
  /** Countdown shown after a round's summary, before the next round starts. */
  roundSummaryTimeSec: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionView {
  roundIndex: number;
  roundsTotal: number;
  questionIndex: number;
  questionsTotal: number;
  categoryName: string;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  deadline: number;
}

export interface AnswerResult {
  playerId: string;
  nickname: string;
  correct: boolean;
  points: number;
  optionId: string | null;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
}

export interface RevealView {
  correctOptionId: string;
  results: AnswerResult[];
  leaderboard: LeaderboardEntry[];
}

export interface RoundSummaryView {
  roundIndex: number;
  roundsTotal: number;
  categoryName: string;
  leaderboard: LeaderboardEntry[];
  top3: LeaderboardEntry[];
}

export interface GameEndView {
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
}

export interface GameStateSync {
  phase: Phase;
  paused: boolean;
  config: GameConfig | null;
  roundIndex: number;
  roundsTotal: number;
  /** Deadline (epoch ms) of whichever timer is active for the current phase, if
   * any. This is the single source of truth for client-side countdowns — it is
   * re-broadcast on pause/resume so clients always recompute from a fresh value
   * instead of drifting against a stale one. */
  deadline: number | null;
}

export interface CategoryVoteView {
  categories: Category[];
  deadline: number;
}

export type VoteTally = Record<number, number>;

export interface CategoryResultView {
  categoryId: number;
  categoryName: string;
  tally: VoteTally;
}

export interface JoinAck {
  ok: boolean;
  playerId?: string;
  reason?: string;
}

export interface SimpleAck {
  ok: boolean;
  reason?: string;
}
