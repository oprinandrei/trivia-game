/** A countdown that can be paused/resumed without losing its remaining time,
 * and can be force-expired early (e.g. once every player has answered). */
export class PhaseTimer {
  private deadline = 0;
  private remainingMs = 0;
  private handle: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private readonly onExpire: () => void;

  constructor(onExpire: () => void) {
    this.onExpire = onExpire;
  }

  start(durationMs: number): void {
    this.clear();
    this.remainingMs = durationMs;
    this.paused = false;
    this.deadline = Date.now() + durationMs;
    this.handle = setTimeout(() => this.fire(), durationMs);
  }

  private fire(): void {
    this.handle = null;
    this.onExpire();
  }

  pause(): void {
    if (this.paused || !this.handle) return;
    this.paused = true;
    clearTimeout(this.handle);
    this.handle = null;
    this.remainingMs = Math.max(0, this.deadline - Date.now());
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.deadline = Date.now() + this.remainingMs;
    this.handle = setTimeout(() => this.fire(), this.remainingMs);
  }

  clear(): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
  }

  forceExpireNow(): void {
    this.clear();
    this.onExpire();
  }

  getDeadline(): number {
    return this.deadline;
  }

  isPaused(): boolean {
    return this.paused;
  }
}
