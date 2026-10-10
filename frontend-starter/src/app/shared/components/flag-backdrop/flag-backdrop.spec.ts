import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Origin } from '../../models/vehicle.model';
import { FlagBackdropComponent } from './flag-backdrop';

const origin = (name: string, flagUrl: string | null): Origin => ({ name, code: null, flagUrl });

describe('FlagBackdropComponent', () => {
  let fixture: ComponentFixture<FlagBackdropComponent>;

  const host = () => fixture.nativeElement as HTMLElement;
  const render = async (origins: Origin[], fade?: 'none' | 'right' | 'bottom' | 'both') => {
    fixture.componentRef.setInput('origins', origins);
    if (fade) fixture.componentRef.setInput('fade', fade);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FlagBackdropComponent] });
    fixture = TestBed.createComponent(FlagBackdropComponent);
  });

  it('affiche le drapeau en image de fond, avec ondulation et plis', async () => {
    await render([origin('France', 'https://commons.wikimedia.org/fr.png')]);
    const flag = host().querySelector<HTMLElement>('.flag')!;
    expect(flag.style.backgroundImage).toContain('fr.png');
    expect(host().querySelector<HTMLElement>('.flags')!.style.filter).toContain('url(#flag-wave-');
    expect(host().querySelector('filter feDisplacementMap')).not.toBeNull();
    expect(host().querySelector('.folds')).not.toBeNull();
  });

  it('ignore les pays sans drapeau et en garde deux au maximum', async () => {
    await render([origin('A', null), origin('B', 'b.png'), origin('C', 'c.png'), origin('D', 'd.png')]);
    const flags = [...host().querySelectorAll<HTMLElement>('.flag')];
    expect(flags.map((f) => f.getAttribute('title'))).toEqual(['B', 'C']);
  });

  it('fond neutre sans aucun drapeau', async () => {
    await render([]);
    expect(host().querySelector('.flag.neutral')).not.toBeNull();
  });

  it('applique le fondu demandé', async () => {
    await render([origin('France', 'fr.png')], 'both');
    expect(host().classList).toContain('fade-both');
    expect(host().classList).not.toContain('fade-right');
  });

  it('chaque instance a son propre filtre SVG', () => {
    const other = TestBed.createComponent(FlagBackdropComponent);
    expect(other.componentInstance.filterId).not.toBe(fixture.componentInstance.filterId);
  });
});
