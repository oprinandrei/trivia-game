import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from '../shared/game-service';
import { Countdown } from '../shared/countdown';
import { TransitionOverlay } from '../shared/transition-overlay';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [FormsModule, Countdown, TransitionOverlay],
  templateUrl: './play.html',
  styleUrl: './play.css',
})
export class Play {
  readonly gs = inject(GameService);

  readonly nicknameInput = signal(this.gs.nickname() ?? '');
  readonly joinError = signal<string | null>(null);
  readonly joining = signal(false);

  readonly myVoteCategoryId = signal<number | null>(null);

  readonly joined = computed(() => this.gs.playerId() !== null);

  readonly myRank = computed(() => {
    const board = this.gs.leaderboard();
    const idx = board.findIndex((e) => e.playerId === this.gs.playerId());
    return idx === -1 ? null : idx + 1;
  });

  readonly myReveal = computed(() => {
    const r = this.gs.reveal();
    if (!r) return null;
    return r.results.find((res) => res.playerId === this.gs.playerId()) ?? null;
  });

  private readonly resetVoteOnNewRound = effect(() => {
    this.gs.categoryOptions();
    this.myVoteCategoryId.set(null);
  });

  async join(): Promise<void> {
    const name = this.nicknameInput().trim();
    if (!name) return;
    this.joining.set(true);
    this.joinError.set(null);
    const ack = await this.gs.join(name);
    this.joining.set(false);
    if (!ack.ok) this.joinError.set(ack.reason ?? 'Could not join');
  }

  async vote(categoryId: number): Promise<void> {
    if (this.myVoteCategoryId() !== null) return;
    const ack = await this.gs.vote(categoryId);
    if (ack.ok) this.myVoteCategoryId.set(categoryId);
  }

  async answer(optionId: string): Promise<void> {
    if (this.gs.myAnswerOptionId() !== null) return;
    await this.gs.answer(optionId);
  }
}
