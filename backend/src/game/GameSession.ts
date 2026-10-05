import { randomUUID } from 'crypto';
import {
  fetchCategories,
  fetchRoundQuestions,
  InsufficientQuestionsError,
  RawQuestion,
  requestSessionToken,
} from '../opentdb/client';
import { pickRandomCategories, pickWinningCategory, tallyVotes } from './categoryVote';
import { pointsForRank } from './scoring';
import { PhaseTimer } from './PhaseTimer';
import {
  AnswerResult,
  Category,
  GameConfig,
  LeaderboardEntry,
  Phase,
  PublicPlayer,
  QuestionOption,
  QuestionType,
  SimpleAck,
  VoteTally,
} from '../shared/types';

const MIN_PLAYERS = 2;
const VOTE_TIME_MS = 15_000;

interface PlayerRecord {
  id: string;
  nickname: string;
  socketId: string | null;
  connected: boolean;
  score: number;
}

interface QuestionRecord {
  type: QuestionType;
  categoryName: string;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
}

interface SubmittedAnswer {
  optionId: string;
  atMs: number;
}

export interface GameBroadcaster {
  gameState(): void;
  lobbyPlayers(): void;
  categoryOptions(categories: Category[], deadline: number): void;
  voteUpdate(tally: VoteTally): void;
  categoryResult(categoryId: number, categoryName: string, tally: VoteTally): void;
  questionShow(view: {
    roundIndex: number;
    roundsTotal: number;
    questionIndex: number;
    questionsTotal: number;
    categoryName: string;
    type: QuestionType;
    text: string;
    options: QuestionOption[];
    deadline: number;
  }): void;
  questionReveal(correctOptionId: string, results: AnswerResult[], leaderboard: LeaderboardEntry[]): void;
  roundSummary(roundIndex: number, categoryName: string, leaderboard: LeaderboardEntry[], top3: LeaderboardEntry[]): void;
  gameEnd(leaderboard: LeaderboardEntry[], winner: LeaderboardEntry | null): void;
  errorNotice(message: string): void;
  /** Clears any cached per-phase payloads kept for resyncing late-joining
   * sockets, so a client connecting after newGame() doesn't get replayed a
   * stale reveal/round-summary/game-end from the previous game. */
  resetSnapshots(): void;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildQuestionRecord(raw: RawQuestion): QuestionRecord {
  const optionTexts = shuffle([raw.correct_answer, ...raw.incorrect_answers]);
  const options: QuestionOption[] = optionTexts.map((text, i) => ({ id: `opt_${i}`, text }));
  const correctOptionId = options.find((o) => o.text === raw.correct_answer)!.id;
  return {
    type: raw.type,
    categoryName: raw.category,
    text: raw.question,
    options,
    correctOptionId,
  };
}

export class GameSession {
  private broadcaster!: GameBroadcaster;
  private allCategories: Category[] = [];
  private token: string | null = null;

  private phase: Phase = 'LOBBY';
  private paused = false;
  private config: GameConfig | null = null;

  private players = new Map<string, PlayerRecord>();

  private roundIndex = 0;
  private usedCategoryIds = new Set<number>();
  private currentCategoryOptions: Category[] = [];
  private currentCategoryName = '';
  private votes = new Map<string, number>();

  private roundQuestions: QuestionRecord[] = [];
  private questionIndex = 0;
  private answers = new Map<string, SubmittedAnswer>();

  private voteTimer = new PhaseTimer(() => this.resolveCategoryVote());
  private categoryResultTimer = new PhaseTimer(() => this.startQuestion());
  private questionTimer = new PhaseTimer(() => this.revealQuestion());
  private revealTimer = new PhaseTimer(() => this.afterReveal());
  private summaryTimer = new PhaseTimer(() => this.afterRoundSummary());

  async init(broadcaster: GameBroadcaster): Promise<void> {
    this.broadcaster = broadcaster;
    this.allCategories = await fetchCategories();
  }

  // ---------- players ----------

  getPublicPlayers(): PublicPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      score: p.score,
    }));
  }

  addPlayer(nickname: string, socketId: string): { ok: boolean; playerId?: string; reason?: string } {
    const trimmed = nickname.trim();
    if (!trimmed) return { ok: false, reason: 'Nickname cannot be empty' };
    const existingByName = [...this.players.values()].find(
      (p) => p.nickname.toLowerCase() === trimmed.toLowerCase(),
    );

    if (this.phase === 'LOBBY') {
      if (existingByName) return { ok: false, reason: 'Nickname already taken' };
      const player: PlayerRecord = {
        id: randomUUID(),
        nickname: trimmed,
        socketId,
        connected: true,
        score: 0,
      };
      this.players.set(player.id, player);
      this.broadcaster.lobbyPlayers();
      return { ok: true, playerId: player.id };
    }

    // Game in progress: only allow reconnecting to an existing, disconnected player.
    if (existingByName && !existingByName.connected) {
      existingByName.socketId = socketId;
      existingByName.connected = true;
      this.broadcaster.lobbyPlayers();
      return { ok: true, playerId: existingByName.id };
    }
    if (existingByName && existingByName.connected) {
      return { ok: false, reason: 'Nickname already connected' };
    }
    return { ok: false, reason: 'Game already in progress' };
  }

  removePlayerBySocket(socketId: string): void {
    const player = [...this.players.values()].find((p) => p.socketId === socketId);
    if (!player) return;
    if (this.phase === 'LOBBY') {
      this.players.delete(player.id);
    } else {
      player.connected = false;
      player.socketId = null;
    }
    this.broadcaster.lobbyPlayers();
    this.maybeAdvanceEarly();
  }

  private connectedPlayers(): PlayerRecord[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  // ---------- config / lifecycle ----------

  configure(config: GameConfig): SimpleAck {
    if (this.phase !== 'LOBBY') return { ok: false, reason: 'Game already started' };
    if (config.rounds < 1 || config.rounds > 10) return { ok: false, reason: 'rounds must be 1-10' };
    if (config.questionsPerRound < 1 || config.questionsPerRound > 20)
      return { ok: false, reason: 'questionsPerRound must be 1-20' };
    if (config.timeLimitSec < 5 || config.timeLimitSec > 60)
      return { ok: false, reason: 'timeLimitSec must be 5-60' };
    if (config.categoryResultTimeSec < 3 || config.categoryResultTimeSec > 30)
      return { ok: false, reason: 'categoryResultTimeSec must be 3-30' };
    if (config.revealTimeSec < 3 || config.revealTimeSec > 30)
      return { ok: false, reason: 'revealTimeSec must be 3-30' };
    if (config.roundSummaryTimeSec < 3 || config.roundSummaryTimeSec > 60)
      return { ok: false, reason: 'roundSummaryTimeSec must be 3-60' };
    this.config = config;
    this.broadcaster.gameState();
    return { ok: true };
  }

  async startGame(): Promise<SimpleAck> {
    if (this.phase !== 'LOBBY') return { ok: false, reason: 'Game already started' };
    if (!this.config) return { ok: false, reason: 'Game not configured' };
    if (this.connectedPlayers().length < MIN_PLAYERS)
      return { ok: false, reason: `Need at least ${MIN_PLAYERS} players to start` };

    this.token = await requestSessionToken();
    this.roundIndex = 0;
    this.usedCategoryIds.clear();
    for (const p of this.players.values()) p.score = 0;

    void this.startRound();
    return { ok: true };
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.activeTimer()?.pause();
    this.broadcaster.gameState();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.activeTimer()?.resume();
    this.broadcaster.gameState();
  }

  private activeTimer(): PhaseTimer | null {
    switch (this.phase) {
      case 'CATEGORY_VOTE':
        return this.voteTimer;
      case 'CATEGORY_RESULT':
        return this.categoryResultTimer;
      case 'QUESTION_ACTIVE':
        return this.questionTimer;
      case 'REVEAL':
        return this.revealTimer;
      case 'ROUND_SUMMARY':
        return this.summaryTimer;
      default:
        return null;
    }
  }

  // ---------- category vote ----------

  private async startRound(): Promise<void> {
    this.phase = 'CATEGORY_VOTE';
    this.votes.clear();
    this.currentCategoryOptions = pickRandomCategories(this.allCategories, 6, this.usedCategoryIds);
    this.voteTimer.start(VOTE_TIME_MS);
    this.broadcaster.gameState();
    this.broadcaster.categoryOptions(this.currentCategoryOptions, this.voteTimer.getDeadline());
  }

  submitVote(playerId: string, categoryId: number): SimpleAck {
    if (this.phase !== 'CATEGORY_VOTE') return { ok: false, reason: 'Not voting right now' };
    const player = this.players.get(playerId);
    if (!player || !player.connected) return { ok: false, reason: 'Unknown player' };
    if (!this.currentCategoryOptions.some((c) => c.id === categoryId)) {
      return { ok: false, reason: 'Invalid category' };
    }
    this.votes.set(playerId, categoryId);
    this.broadcaster.voteUpdate(tallyVotes(this.votes));
    this.maybeAdvanceEarly();
    return { ok: true };
  }

  private async resolveCategoryVote(): Promise<void> {
    const tally = tallyVotes(this.votes);
    const candidates = [...this.currentCategoryOptions];

    for (let i = 0; i < candidates.length; i++) {
      const winner =
        i === 0 ? pickWinningCategory(tally, candidates) : candidates[Math.floor(Math.random() * candidates.length)];
      try {
        const raw = await fetchRoundQuestions(
          {
            amount: this.config!.questionsPerRound,
            categoryId: winner.id,
            difficulty: this.config!.difficulty,
            type: this.config!.answerType === 'both' ? undefined : this.config!.answerType,
            token: this.token!,
          },
          (newToken) => (this.token = newToken),
        );
        this.usedCategoryIds.add(winner.id);
        this.currentCategoryName = winner.name;
        this.roundQuestions = raw.map(buildQuestionRecord);
        this.questionIndex = 0;
        this.phase = 'CATEGORY_RESULT';
        this.categoryResultTimer.start(this.config!.categoryResultTimeSec * 1000);
        this.broadcaster.gameState();
        this.broadcaster.categoryResult(winner.id, winner.name, tally);
        return;
      } catch (err) {
        if (err instanceof InsufficientQuestionsError) {
          candidates.splice(candidates.indexOf(winner), 1);
          continue;
        }
        this.broadcaster.errorNotice(`Failed to fetch questions: ${(err as Error).message}`);
        return;
      }
    }
    this.broadcaster.errorNotice('None of the offered categories had enough questions. Ending game.');
    this.finishGame();
  }

  // ---------- questions ----------

  private async startQuestion(): Promise<void> {
    this.phase = 'QUESTION_ACTIVE';
    this.answers.clear();
    const q = this.roundQuestions[this.questionIndex];
    const timeLimitMs = this.config!.timeLimitSec * 1000;
    this.questionTimer.start(timeLimitMs);
    this.broadcaster.gameState();
    this.broadcaster.questionShow({
      roundIndex: this.roundIndex,
      roundsTotal: this.config!.rounds,
      questionIndex: this.questionIndex,
      questionsTotal: this.roundQuestions.length,
      categoryName: this.currentCategoryName,
      type: q.type,
      text: q.text,
      options: q.options,
      deadline: this.questionTimer.getDeadline(),
    });
  }

  submitAnswer(playerId: string, optionId: string): SimpleAck {
    if (this.phase !== 'QUESTION_ACTIVE') return { ok: false, reason: 'No question active' };
    const player = this.players.get(playerId);
    if (!player || !player.connected) return { ok: false, reason: 'Unknown player' };
    if (this.answers.has(playerId)) return { ok: false, reason: 'Already answered' };
    const q = this.roundQuestions[this.questionIndex];
    if (!q.options.some((o) => o.id === optionId)) return { ok: false, reason: 'Invalid option' };

    this.answers.set(playerId, { optionId, atMs: Date.now() });
    this.maybeAdvanceEarly();
    return { ok: true };
  }

  private maybeAdvanceEarly(): void {
    const connected = this.connectedPlayers();
    if (connected.length === 0) return;
    if (this.phase === 'CATEGORY_VOTE' && connected.every((p) => this.votes.has(p.id))) {
      this.voteTimer.forceExpireNow();
    } else if (this.phase === 'QUESTION_ACTIVE' && connected.every((p) => this.answers.has(p.id))) {
      this.questionTimer.forceExpireNow();
    }
  }

  private revealQuestion(): void {
    this.phase = 'REVEAL';
    const q = this.roundQuestions[this.questionIndex];

    // Points are rank-based on who answered correctly first: fastest correct
    // answer gets MAX_POINTS, each next-fastest correct answer gets one less,
    // down to a floor of 1 point for every remaining correct answer.
    const correctAnswerers = [...this.players.values()]
      .map((player) => ({ player, answer: this.answers.get(player.id) }))
      .filter((e): e is { player: PlayerRecord; answer: SubmittedAnswer } => !!e.answer && e.answer.optionId === q.correctOptionId)
      .sort((a, b) => a.answer.atMs - b.answer.atMs);

    const pointsByPlayerId = new Map<string, number>();
    correctAnswerers.forEach((e, rank) => pointsByPlayerId.set(e.player.id, pointsForRank(rank)));

    const results: AnswerResult[] = [...this.players.values()].map((player) => {
      const answer = this.answers.get(player.id);
      const correct = !!answer && answer.optionId === q.correctOptionId;
      const points = pointsByPlayerId.get(player.id) ?? 0;
      player.score += points;
      return {
        playerId: player.id,
        nickname: player.nickname,
        correct,
        points,
        optionId: answer?.optionId ?? null,
      };
    });

    this.revealTimer.start(this.config!.revealTimeSec * 1000);
    this.broadcaster.gameState();
    this.broadcaster.lobbyPlayers();
    this.broadcaster.questionReveal(q.correctOptionId, results, this.leaderboard());
  }

  private afterReveal(): void {
    this.questionIndex += 1;
    if (this.questionIndex < this.roundQuestions.length) {
      void this.startQuestion();
    } else {
      this.showRoundSummary();
    }
  }

  private showRoundSummary(): void {
    this.phase = 'ROUND_SUMMARY';
    const leaderboard = this.leaderboard();
    this.summaryTimer.start(this.config!.roundSummaryTimeSec * 1000);
    this.broadcaster.gameState();
    this.broadcaster.roundSummary(this.roundIndex, this.currentCategoryName, leaderboard, leaderboard.slice(0, 3));
  }

  private afterRoundSummary(): void {
    this.roundIndex += 1;
    if (this.roundIndex < this.config!.rounds) {
      void this.startRound();
    } else {
      this.finishGame();
    }
  }

  private finishGame(): void {
    this.phase = 'GAME_END';
    const leaderboard = this.leaderboard();
    this.broadcaster.gameState();
    this.broadcaster.gameEnd(leaderboard, leaderboard[0] ?? null);
  }

  /** Resets back to LOBBY so the host can run another game without restarting
   * the server. Only valid once a game has actually finished. Drops players
   * who disconnected during the last game and zeroes remaining scores; keeps
   * the previous config as a starting point since the host will usually want
   * something similar. */
  newGame(): SimpleAck {
    if (this.phase !== 'GAME_END') return { ok: false, reason: 'Game not finished' };

    this.voteTimer.clear();
    this.categoryResultTimer.clear();
    this.questionTimer.clear();
    this.revealTimer.clear();
    this.summaryTimer.clear();

    this.phase = 'LOBBY';
    this.paused = false;
    this.roundIndex = 0;
    this.usedCategoryIds.clear();
    this.currentCategoryOptions = [];
    this.currentCategoryName = '';
    this.votes.clear();
    this.roundQuestions = [];
    this.questionIndex = 0;
    this.answers.clear();

    for (const [id, player] of this.players) {
      if (!player.connected) this.players.delete(id);
      else player.score = 0;
    }

    this.broadcaster.resetSnapshots();
    this.broadcaster.gameState();
    this.broadcaster.lobbyPlayers();
    return { ok: true };
  }

  private leaderboard(): LeaderboardEntry[] {
    return [...this.players.values()]
      .map((p) => ({ playerId: p.id, nickname: p.nickname, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  // ---------- snapshot for newly (re)connecting clients ----------

  getStateSync() {
    return {
      phase: this.phase,
      paused: this.paused,
      config: this.config,
      roundIndex: this.roundIndex,
      roundsTotal: this.config?.rounds ?? 0,
      deadline: this.activeTimer()?.getDeadline() ?? null,
    };
  }
}
