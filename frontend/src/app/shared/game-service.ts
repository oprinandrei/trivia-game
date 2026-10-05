import { Injectable, computed, signal } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { SocketEvents } from './events';
import {
  Category,
  CategoryResultView,
  CategoryVoteView,
  GameConfig,
  GameEndView,
  GameStateSync,
  JoinAck,
  Phase,
  PublicPlayer,
  QuestionView,
  RevealView,
  RoundSummaryView,
  SimpleAck,
  VoteTally,
} from './types';

const NICKNAME_KEY = 'trivia:nickname';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly socket: Socket = io();

  readonly connected = signal(false);

  readonly phase = signal<Phase>('LOBBY');
  readonly paused = signal(false);
  readonly config = signal<GameConfig | null>(null);
  readonly roundIndex = signal(0);
  readonly roundsTotal = signal(0);
  readonly deadline = signal<number | null>(null);

  readonly players = signal<PublicPlayer[]>([]);

  readonly categoryOptions = signal<Category[] | null>(null);
  readonly voteTally = signal<VoteTally>({});
  readonly categoryResult = signal<CategoryResultView | null>(null);

  readonly currentQuestion = signal<QuestionView | null>(null);
  readonly myAnswerOptionId = signal<string | null>(null);
  readonly reveal = signal<RevealView | null>(null);
  readonly roundSummary = signal<RoundSummaryView | null>(null);
  readonly gameEnd = signal<GameEndView | null>(null);

  readonly errorNotice = signal<string | null>(null);

  readonly playerId = signal<string | null>(null);
  readonly nickname = signal<string | null>(localStorage.getItem(NICKNAME_KEY));

  readonly me = computed(() => this.players().find((p) => p.id === this.playerId()) ?? null);
  readonly leaderboard = computed(() =>
    [...this.players()].sort((a, b) => b.score - a.score).map((p) => ({ playerId: p.id, nickname: p.nickname, score: p.score })),
  );

  constructor() {
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));

    this.socket.on(SocketEvents.GameState, (s: GameStateSync) => {
      this.phase.set(s.phase);
      this.paused.set(s.paused);
      this.config.set(s.config);
      this.roundIndex.set(s.roundIndex);
      this.roundsTotal.set(s.roundsTotal);
      this.deadline.set(s.deadline);
    });

    this.socket.on(SocketEvents.LobbyPlayers, (p: PublicPlayer[]) => this.players.set(p));

    this.socket.on(SocketEvents.CategoryOptions, (v: CategoryVoteView) => {
      this.categoryOptions.set(v.categories);
      this.voteTally.set({});
      this.categoryResult.set(null);
      this.currentQuestion.set(null);
      this.myAnswerOptionId.set(null);
      this.reveal.set(null);
    });

    this.socket.on(SocketEvents.VoteUpdate, (t: VoteTally) => this.voteTally.set(t));
    this.socket.on(SocketEvents.CategoryResult, (v: CategoryResultView) => this.categoryResult.set(v));

    this.socket.on(SocketEvents.QuestionShow, (v: QuestionView) => {
      this.currentQuestion.set(v);
      this.myAnswerOptionId.set(null);
      this.reveal.set(null);
    });

    this.socket.on(SocketEvents.QuestionReveal, (v: RevealView) => this.reveal.set(v));
    this.socket.on(SocketEvents.RoundSummary, (v: RoundSummaryView) => this.roundSummary.set(v));
    this.socket.on(SocketEvents.GameEnd, (v: GameEndView) => this.gameEnd.set(v));
    this.socket.on(SocketEvents.ErrorNotice, (v: { message: string }) => this.errorNotice.set(v.message));
  }

  join(nickname: string): Promise<JoinAck> {
    return new Promise((resolve) => {
      this.socket.emit(SocketEvents.PlayerJoin, { nickname }, (ack: JoinAck) => {
        if (ack.ok && ack.playerId) {
          this.playerId.set(ack.playerId);
          this.nickname.set(nickname);
          localStorage.setItem(NICKNAME_KEY, nickname);
        }
        resolve(ack);
      });
    });
  }

  vote(categoryId: number): Promise<SimpleAck> {
    return new Promise((resolve) => {
      this.socket.emit(SocketEvents.PlayerVote, { playerId: this.playerId(), categoryId }, resolve);
    });
  }

  answer(optionId: string): Promise<SimpleAck> {
    this.myAnswerOptionId.set(optionId);
    return new Promise((resolve) => {
      this.socket.emit(SocketEvents.PlayerAnswer, { playerId: this.playerId(), optionId }, resolve);
    });
  }

  configure(config: GameConfig): Promise<SimpleAck> {
    return new Promise((resolve) => this.socket.emit(SocketEvents.HostConfigure, config, resolve));
  }

  startGame(): Promise<SimpleAck> {
    return new Promise((resolve) => this.socket.emit(SocketEvents.HostStartGame, {}, resolve));
  }

  newGame(): Promise<SimpleAck> {
    return new Promise((resolve) => {
      this.socket.emit(SocketEvents.HostNewGame, {}, (ack: SimpleAck) => {
        if (ack.ok) {
          this.gameEnd.set(null);
          this.roundSummary.set(null);
          this.reveal.set(null);
          this.currentQuestion.set(null);
          this.categoryOptions.set(null);
          this.categoryResult.set(null);
        }
        resolve(ack);
      });
    });
  }

  pauseGame(): void {
    this.socket.emit(SocketEvents.HostPause);
  }

  resumeGame(): void {
    this.socket.emit(SocketEvents.HostResume);
  }
}
