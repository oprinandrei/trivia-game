import { Injectable, signal } from '@angular/core';

export type SoundKey = 'lobby' | 'question' | 'timeWarning' | 'countdown' | 'voteCountdown';

/** Placeholder audio files — see frontend/public/sounds/README.md. Drop real
 * mp3s in with the same filenames to replace them. */
const SOUND_FILES: Record<SoundKey, string> = {
  lobby: '/sounds/lobby-background.mp3',
  question: '/sounds/question-background.mp3',
  timeWarning: '/sounds/time-warning.mp3',
  countdown: '/sounds/countdown.mp3',
  voteCountdown: '/sounds/vote-countdown.mp3',
};

const ENABLED_KEY = 'trivia:soundEnabled';

/** Host-only sound cues. Players never get a SoundService wired up. Autoplay
 * policies require a user gesture before audio can play, so `enabled`
 * defaults to off until the host opts in via the UI toggle. */
@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly enabled = signal(this.loadEnabledPref());

  private readonly elements = new Map<SoundKey, HTMLAudioElement>();
  private currentLoop: SoundKey | null = null;

  constructor() {
    if (typeof Audio === 'undefined') return;
    for (const key of Object.keys(SOUND_FILES) as SoundKey[]) {
      const el = new Audio(SOUND_FILES[key]);
      el.preload = 'auto';
      this.elements.set(key, el);
    }
  }

  private loadEnabledPref(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(ENABLED_KEY) === 'true';
  }

  setEnabled(value: boolean): void {
    this.enabled.set(value);
    localStorage.setItem(ENABLED_KEY, String(value));
    if (value) {
      // Re-trigger whatever loop should currently be playing, using this
      // click as the required user gesture to unlock audio playback.
      const key = this.currentLoop;
      this.currentLoop = null;
      if (key) this.playLoop(key);
    } else {
      this.stopLoop();
    }
  }

  /** Starts looping `key`, stopping whatever loop was previously playing.
   * Safe to call repeatedly with the same key (no-op if already playing). */
  playLoop(key: SoundKey): void {
    if (this.currentLoop === key) return;
    this.stopPlayingLoop();
    this.currentLoop = key;
    if (!this.enabled()) return;
    const el = this.elements.get(key);
    if (!el) return;
    el.loop = true;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }

  stopLoop(): void {
    this.stopPlayingLoop();
    this.currentLoop = null;
  }

  private stopPlayingLoop(): void {
    if (!this.currentLoop) return;
    const el = this.elements.get(this.currentLoop);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }

  /** Plays a one-shot cue on top of whatever loop is active, e.g. the
   * time-almost-over sting during a question. */
  playOnce(key: SoundKey): void {
    if (!this.enabled()) return;
    const el = this.elements.get(key);
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }
}
