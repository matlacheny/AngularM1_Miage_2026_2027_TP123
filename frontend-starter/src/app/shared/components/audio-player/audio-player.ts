import { Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon';

export const BAR_COUNT = 40;

/**
 * Hauteurs des barres (0.2 à 1), stables pour un même `seed` : chaque son a
 * sa propre « signature » visuelle. Ce n'est pas encore la vraie forme
 * d'onde, qui sera calculée avec la WebAudio API (étape 7).
 */
export function barHeights(seed: string, count = BAR_COUNT): number[] {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return 0.2 + (state / 0xffffffff) * 0.8;
  });
}

/** « 75 » → « 1:15 ». */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Lecteur audio de la maquette : bouton rond ambre, barres qui se colorent
 * au fil de la lecture (clic ou flèches pour se déplacer), temps écoulé/total.
 */
@Component({
  selector: 'app-audio-player',
  imports: [IconComponent],
  template: `
    <audio
      #audio
      [src]="src()"
      preload="metadata"
      (play)="playing.set(true)"
      (pause)="playing.set(false)"
      (ended)="playing.set(false)"
      (timeupdate)="current.set(audio.currentTime)"
      (loadedmetadata)="duration.set(audio.duration)"
    ></audio>
    <button type="button" class="play" (click)="toggle()" [attr.aria-label]="playing() ? 'Pause' : 'Lecture'">
      <app-icon [name]="playing() ? 'pause' : 'play'" />
    </button>
    <div
      class="bars"
      role="slider"
      tabindex="0"
      aria-label="Position de lecture"
      aria-valuemin="0"
      [attr.aria-valuemax]="seconds(duration())"
      [attr.aria-valuenow]="seconds(current())"
      [attr.aria-valuetext]="time()"
      (click)="seekFromClick($event)"
      (keydown.arrowright)="seekBy(5)"
      (keydown.arrowleft)="seekBy(-5)"
    >
      @for (h of heights(); track $index) {
        <span [class.played]="$index < playedBars()" [style.height.%]="h * 100"></span>
      }
    </div>
    <span class="time">{{ time() }}</span>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 1rem; padding: 0.8rem 1rem; background: var(--surface-2); border-radius: 12px; }
    audio { display: none; }
    .play { width: 3rem; height: 3rem; padding: 0; color: #17130a; background: var(--accent); border-radius: 50%; --icon-size: 1.2rem; }
    .play:hover:not(:disabled) { background: #f2b843; }
    .bars { display: flex; flex: 1; align-items: center; gap: 3px; height: 2.6rem; overflow: hidden; cursor: pointer; }
    .bars span { flex: 0 1 3px; min-width: 1px; background: #555a61; border-radius: 2px; transition: background 0.15s; }
    .bars span.played { background: var(--accent); }
    .time { min-width: 2.6rem; color: var(--muted); font-size: 0.9rem; font-variant-numeric: tabular-nums; text-align: right; }
    .bars { min-width: 0; }
  `,
})
export class AudioPlayerComponent {
  readonly src = input.required<string>();
  /** Graine des barres (en général l'identifiant du média). */
  readonly seed = input('');

  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  readonly playing = signal(false);
  readonly current = signal(0);
  readonly duration = signal(0);

  readonly heights = computed(() => barHeights(this.seed() || this.src()));
  readonly playedBars = computed(() =>
    this.duration() ? Math.round((this.current() / this.duration()) * BAR_COUNT) : 0,
  );
  /** Comme la maquette : la durée totale, puis le temps écoulé pendant la lecture. */
  readonly time = computed(() => formatTime(this.current() > 0 || this.playing() ? this.current() : this.duration()));

  constructor() {
    // Nouveau son : on repart de zéro.
    effect(() => {
      this.src();
      this.playing.set(false);
      this.current.set(0);
      this.duration.set(0);
    });
  }

  /** Secondes entières pour les attributs ARIA. */
  seconds(value: number): number {
    return Math.floor(value || 0);
  }

  toggle(): void {
    const audio = this.audio().nativeElement;
    if (audio.paused) {
      audio.play().catch((error: unknown) => console.error('[AudioPlayer] Lecture impossible', error));
    } else {
      audio.pause();
    }
  }

  seekFromClick(event: MouseEvent): void {
    const bars = event.currentTarget as HTMLElement;
    const rect = bars.getBoundingClientRect();
    if (!rect.width || !this.duration()) return;
    this.seekTo(((event.clientX - rect.left) / rect.width) * this.duration());
  }

  seekBy(delta: number): void {
    this.seekTo(this.current() + delta);
  }

  private seekTo(seconds: number): void {
    const audio = this.audio().nativeElement;
    const target = Math.min(Math.max(seconds, 0), this.duration() || 0);
    audio.currentTime = target;
    this.current.set(target);
  }
}
