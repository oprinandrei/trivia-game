import { Component, input } from '@angular/core';
import { Countdown } from './countdown';

/** Full-screen countdown transition shown between game segments (category
 * chosen -> first question, question reveal -> next question, round summary
 * -> next round). Overlays on top of whatever's already on screen, using the
 * same deadline/paused inputs that drive the small inline countdown. */
@Component({
  selector: 'app-transition-overlay',
  standalone: true,
  imports: [Countdown],
  template: `
    <div class="transition-overlay">
      <div class="transition-label">{{ label() }}</div>
      <app-countdown [deadline]="deadline()" [paused]="paused()" [big]="true" />
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .transition-overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        padding: 2rem;
        background: linear-gradient(
          160deg,
          var(--lemon-chiffon) 0%,
          var(--powder-petal) 20%,
          var(--cotton-rose) 35%,
          var(--pink-orchid) 50%,
          var(--periwinkle) 65%,
          var(--baby-blue-ice) 80%,
          var(--electric-aqua) 100%
        );
        background-size: 200% 200%;
        animation: transition-pan 6s ease-in-out infinite alternate;
      }
      .transition-label {
        font-size: 1.3rem;
        font-weight: 700;
        color: var(--text);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      @keyframes transition-pan {
        from {
          background-position: 0% 50%;
        }
        to {
          background-position: 100% 50%;
        }
      }
    `,
  ],
})
export class TransitionOverlay {
  readonly label = input<string>('');
  readonly deadline = input<number | null>(null);
  readonly paused = input<boolean>(false);
}
