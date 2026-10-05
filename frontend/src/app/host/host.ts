import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from '../shared/game-service';
import { Countdown } from '../shared/countdown';
import { TransitionOverlay } from '../shared/transition-overlay';
import { SoundService } from '../shared/sound-service';
import { AnswerType, Difficulty } from '../shared/types';

const TIME_WARNING_MS = 5_000;

@Component({
  selector: 'app-host',
  standalone: true,
  imports: [FormsModule, Countdown, TransitionOverlay],
  templateUrl: './host.html',
  styleUrl: './host.css',
})
export class Host {
  readonly gs = inject(GameService);
  readonly sound = inject(SoundService);

  // ---- config form state ----
  readonly rounds = signal(3);
  readonly questionsPerRound = signal(5);
  readonly difficulty = signal<Difficulty>('medium');
  readonly answerType = signal<AnswerType>('multiple');
  readonly timeLimitSec = signal(20);
  readonly categoryResultTimeSec = signal(4);
  readonly revealTimeSec = signal(5);
  readonly roundSummaryTimeSec = signal(8);
  readonly configError = signal<string | null>(null);
  readonly configSaved = signal(false);
  readonly startError = signal<string | null>(null);
  readonly starting = signal(false);

  readonly joinUrl = signal(this.computeJoinUrl());

  private computeJoinUrl(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.protocol}//${window.location.host}/play`;
  }

  static readonly MIN_PLAYERS = 2;

  readonly connectedPlayers = computed(() => this.gs.players().filter((p) => p.connected));
  readonly canStart = computed(
    () => this.gs.config() !== null && this.connectedPlayers().length >= Host.MIN_PLAYERS,
  );

  readonly voteRows = computed(() => {
    const categories = this.gs.categoryOptions() ?? [];
    const tally = this.gs.voteTally();
    const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
    return categories
      .map((c) => ({ ...c, votes: tally[c.id] ?? 0, pct: Math.round(((tally[c.id] ?? 0) / total) * 100) }))
      .sort((a, b) => b.votes - a.votes);
  });

  async saveConfig(): Promise<void> {
    this.configError.set(null);
    this.configSaved.set(false);
    const ack = await this.gs.configure({
      rounds: this.rounds(),
      questionsPerRound: this.questionsPerRound(),
      difficulty: this.difficulty(),
      answerType: this.answerType(),
      timeLimitSec: this.timeLimitSec(),
      categoryResultTimeSec: this.categoryResultTimeSec(),
      revealTimeSec: this.revealTimeSec(),
      roundSummaryTimeSec: this.roundSummaryTimeSec(),
    });
    if (!ack.ok) {
      this.configError.set(ack.reason ?? 'Could not save configuration');
    } else {
      this.configSaved.set(true);
    }
  }

  async start(): Promise<void> {
    this.starting.set(true);
    this.startError.set(null);
    const ack = await this.gs.startGame();
    this.starting.set(false);
    if (!ack.ok) this.startError.set(ack.reason ?? 'Could not start game');
  }

  togglePause(): void {
    if (this.gs.paused()) this.gs.resumeGame();
    else this.gs.pauseGame();
  }

  readonly startingNewGame = signal(false);

  async startNewGame(): Promise<void> {
    this.startingNewGame.set(true);
    this.configSaved.set(false);
    await this.gs.newGame();
    this.startingNewGame.set(false);
  }

  readonly correctAnswerText = computed(() => {
    const q = this.gs.currentQuestion();
    const r = this.gs.reveal();
    if (!q || !r) return null;
    return q.options.find((o) => o.id === r.correctOptionId)?.text ?? null;
  });

  toggleSound(): void {
    this.sound.setEnabled(!this.sound.enabled());
  }

  // ---- sound cues (host only) ----

  /** Drives the background/loop cue for whichever phase is active. */
  private readonly phaseSoundEffect = effect(() => {
    switch (this.gs.phase()) {
      case 'LOBBY':
        this.sound.playLoop('lobby');
        break;
      case 'CATEGORY_VOTE':
        this.sound.playLoop('voteCountdown');
        break;
      case 'QUESTION_ACTIVE':
        this.sound.playLoop('question');
        break;
      case 'CATEGORY_RESULT':
      case 'REVEAL':
      case 'ROUND_SUMMARY':
        this.sound.playLoop('countdown');
        break;
      case 'GAME_END':
        this.sound.stopLoop();
        break;
    }
  });

  /** Fires the one-shot "time almost over" sting a fixed window before a
   * question's deadline, re-scheduling itself whenever the deadline changes
   * (e.g. on pause/resume). */
  private readonly timeWarningEffect = effect((onCleanup) => {
    const phase = this.gs.phase();
    const paused = this.gs.paused();
    const deadline = this.gs.deadline();
    if (phase !== 'QUESTION_ACTIVE' || paused || deadline == null) return;

    const msUntilWarning = deadline - Date.now() - TIME_WARNING_MS;
    if (msUntilWarning <= 0) return;
    const handle = setTimeout(() => this.sound.playOnce('timeWarning'), msUntilWarning);
    onCleanup(() => clearTimeout(handle));
  });
}
