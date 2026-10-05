import { Server, Socket } from 'socket.io';
import { GameBroadcaster, GameSession } from '../game/GameSession';
import { SocketEvents } from '../shared/events';
import {
  AnswerResult,
  Category,
  CategoryResultView,
  GameConfig,
  JoinAck,
  LeaderboardEntry,
  QuestionOption,
  QuestionType,
  SimpleAck,
  VoteTally,
} from '../shared/types';

interface QuestionShowPayload {
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

interface RevealPayload {
  correctOptionId: string;
  results: AnswerResult[];
  leaderboard: LeaderboardEntry[];
}

interface RoundSummaryPayload {
  roundIndex: number;
  categoryName: string;
  leaderboard: LeaderboardEntry[];
  top3: LeaderboardEntry[];
}

interface GameEndPayload {
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
}

export async function setupGame(io: Server): Promise<GameSession> {
  const session = new GameSession();

  let lastCategoryOptions: { categories: Category[]; deadline: number } | null = null;
  let lastCategoryResult: CategoryResultView | null = null;
  let lastQuestionShow: QuestionShowPayload | null = null;
  let lastReveal: RevealPayload | null = null;
  let lastRoundSummary: RoundSummaryPayload | null = null;
  let lastGameEnd: GameEndPayload | null = null;

  const broadcaster: GameBroadcaster = {
    gameState() {
      io.emit(SocketEvents.GameState, session.getStateSync());
    },
    lobbyPlayers() {
      io.emit(SocketEvents.LobbyPlayers, session.getPublicPlayers());
    },
    categoryOptions(categories, deadline) {
      lastCategoryOptions = { categories, deadline };
      lastCategoryResult = null;
      lastQuestionShow = null;
      lastReveal = null;
      lastRoundSummary = null;
      io.emit(SocketEvents.CategoryOptions, lastCategoryOptions);
    },
    voteUpdate(tally: VoteTally) {
      io.emit(SocketEvents.VoteUpdate, tally);
    },
    categoryResult(categoryId, categoryName, tally) {
      lastCategoryResult = { categoryId, categoryName, tally };
      io.emit(SocketEvents.CategoryResult, lastCategoryResult);
    },
    questionShow(view) {
      lastQuestionShow = view;
      lastReveal = null;
      io.emit(SocketEvents.QuestionShow, view);
    },
    questionReveal(correctOptionId, results, leaderboard) {
      lastReveal = { correctOptionId, results, leaderboard };
      io.emit(SocketEvents.QuestionReveal, lastReveal);
    },
    roundSummary(roundIndex, categoryName, leaderboard, top3) {
      lastRoundSummary = { roundIndex, categoryName, leaderboard, top3 };
      io.emit(SocketEvents.RoundSummary, lastRoundSummary);
    },
    gameEnd(leaderboard, winner) {
      lastGameEnd = { leaderboard, winner };
      io.emit(SocketEvents.GameEnd, lastGameEnd);
    },
    errorNotice(message) {
      io.emit(SocketEvents.ErrorNotice, { message });
    },
    resetSnapshots() {
      lastCategoryOptions = null;
      lastCategoryResult = null;
      lastQuestionShow = null;
      lastReveal = null;
      lastRoundSummary = null;
      lastGameEnd = null;
    },
  };

  await session.init(broadcaster);

  io.on('connection', (socket: Socket) => {
    socket.emit(SocketEvents.GameState, session.getStateSync());
    socket.emit(SocketEvents.LobbyPlayers, session.getPublicPlayers());
    if (lastCategoryOptions) socket.emit(SocketEvents.CategoryOptions, lastCategoryOptions);
    if (lastCategoryResult) socket.emit(SocketEvents.CategoryResult, lastCategoryResult);
    if (lastQuestionShow) socket.emit(SocketEvents.QuestionShow, lastQuestionShow);
    if (lastReveal) socket.emit(SocketEvents.QuestionReveal, lastReveal);
    if (lastRoundSummary) socket.emit(SocketEvents.RoundSummary, lastRoundSummary);
    if (lastGameEnd) socket.emit(SocketEvents.GameEnd, lastGameEnd);

    socket.on(SocketEvents.PlayerJoin, (payload: { nickname: string }, ack?: (res: JoinAck) => void) => {
      const result = session.addPlayer(payload?.nickname ?? '', socket.id);
      ack?.(result);
    });

    socket.on(
      SocketEvents.PlayerVote,
      (payload: { playerId: string; categoryId: number }, ack?: (res: SimpleAck) => void) => {
        ack?.(session.submitVote(payload.playerId, payload.categoryId));
      },
    );

    socket.on(
      SocketEvents.PlayerAnswer,
      (payload: { playerId: string; optionId: string }, ack?: (res: SimpleAck) => void) => {
        ack?.(session.submitAnswer(payload.playerId, payload.optionId));
      },
    );

    socket.on(SocketEvents.HostConfigure, (payload: GameConfig, ack?: (res: SimpleAck) => void) => {
      ack?.(session.configure(payload));
    });

    socket.on(SocketEvents.HostStartGame, async (_payload: unknown, ack?: (res: SimpleAck) => void) => {
      ack?.(await session.startGame());
    });

    socket.on(SocketEvents.HostPause, () => session.pause());
    socket.on(SocketEvents.HostResume, () => session.resume());
    socket.on(SocketEvents.HostNewGame, (_payload: unknown, ack?: (res: SimpleAck) => void) => {
      ack?.(session.newGame());
    });

    socket.on('disconnect', () => {
      session.removePlayerBySocket(socket.id);
    });
  });

  return session;
}
