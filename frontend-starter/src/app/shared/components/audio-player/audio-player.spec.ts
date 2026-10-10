import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AudioPlayerComponent, BAR_COUNT, barHeights, formatTime } from './audio-player';

describe('barHeights / formatTime', () => {
  it('barres stables pour une même graine, différentes sinon, toutes entre 0.2 et 1', () => {
    const a = barHeights('media-1');
    expect(a).toEqual(barHeights('media-1'));
    expect(a).not.toEqual(barHeights('media-2'));
    expect(a.length).toBe(BAR_COUNT);
    expect(a.every((h) => h >= 0.2 && h <= 1)).toBe(true);
  });

  it('formate les durées en m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('AudioPlayerComponent', () => {
  let fixture: ComponentFixture<AudioPlayerComponent>;
  let component: AudioPlayerComponent;
  let audio: HTMLAudioElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [AudioPlayerComponent] });
    fixture = TestBed.createComponent(AudioPlayerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('src', '/api/media/s1/file?token=t');
    fixture.componentRef.setInput('seed', 's1');
    fixture.detectChanges();
    await fixture.whenStable();
    audio = (fixture.nativeElement as HTMLElement).querySelector('audio')!;
  });

  it("transmet l'URL à l'élément audio, sans lecture automatique", () => {
    expect(audio.getAttribute('src')).toBe('/api/media/s1/file?token=t');
    expect(audio.hasAttribute('autoplay')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.bars span').length).toBe(BAR_COUNT);
  });

  it('le bouton lance puis met en pause la lecture', () => {
    const play = vi.spyOn(audio, 'play').mockResolvedValue();
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
    vi.spyOn(audio, 'paused', 'get').mockReturnValueOnce(true).mockReturnValueOnce(false);

    component.toggle();
    expect(play).toHaveBeenCalled();
    component.toggle();
    expect(pause).toHaveBeenCalled();
  });

  it('colore les barres selon la progression et affiche le temps', async () => {
    component.duration.set(40);
    component.current.set(10);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.playedBars()).toBe(BAR_COUNT / 4);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.bars span.played').length).toBe(BAR_COUNT / 4);
    expect(component.time()).toBe('0:10');
    component.current.set(0);
    expect(component.time()).toBe('0:40'); // avant lecture : la durée totale
  });

  it('les flèches déplacent la lecture de 5 s, sans sortir de la durée', () => {
    component.duration.set(12);
    component.seekBy(5);
    expect(audio.currentTime).toBe(5);
    component.seekBy(30);
    expect(component.current()).toBe(12);
    component.seekBy(-60);
    expect(component.current()).toBe(0);
  });

  it('un nouveau son repart de zéro', async () => {
    component.current.set(8);
    fixture.componentRef.setInput('src', '/api/media/s2/file?token=t');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.current()).toBe(0);
    expect(component.playing()).toBe(false);
  });
});
