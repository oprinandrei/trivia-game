import { Component, OnDestroy, computed, effect, input, signal } from '@angular/core';

@Component({
  selector: 'app-countdown',
  standalone: true,
  template: `
    <span class="countdown" [class.low]="secondsLeft() <= 5" [class.big]="big()"
      >{{ secondsLeft() }}@if (!big()) {<span class="unit">s</span>}</span
    >
  `,
  styles: [
    `
      .countdown {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .low {
        color: var(--bad-strong);
      }
      .big {
        font-size: clamp(4.5rem, 18vw, 11rem);
        line-height: 1;
        color: var(--text);
      }
      .big.low {
        color: var(--bad-strong);
      }
      .unit {
        font-size: 0.7em;
      }
    `,
  ],
})
export class Countdown implements OnDestroy {
  readonly deadline = input<number | null>(null);
  readonly paused = input<boolean>(false);
  readonly big = input<boolean>(false);

  private readonly now = signal(Date.now());
  private readonly frozenMs = signal<number | null>(null);
  private readonly intervalId = setInterval(() => this.now.set(Date.now()), 200);

  constructor() {
    effect(() => {
      const isPaused = this.paused();
      const deadline = this.deadline();
      if (isPaused) {
        if (this.frozenMs() == null && deadline != null) {
          this.frozenMs.set(Math.max(0, deadline - Date.now()));
        }
      } else {
        this.frozenMs.set(null);
      }
    });
  }

  readonly secondsLeft = computed(() => {
    const frozen = this.frozenMs();
    if (frozen != null) return Math.ceil(frozen / 1000);
    const deadline = this.deadline();
    if (deadline == null) return 0;
    return Math.max(0, Math.ceil((deadline - this.now()) / 1000));
  });

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
  }
}
