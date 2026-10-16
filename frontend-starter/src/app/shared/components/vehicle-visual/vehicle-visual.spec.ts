import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VehicleVisualComponent } from './vehicle-visual';

describe('VehicleVisualComponent', () => {
  let fixture: ComponentFixture<VehicleVisualComponent>;
  const element = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(VehicleVisualComponent);
    fixture.componentRef.setInput('category', 'aircraft');
    fixture.componentRef.setInput('origins', [{ name: 'France', code: 'fr', flagUrl: 'https://commons.wikimedia.org/fr.png' }]);
  });

  it('affiche la photo Wikipédia seule, sans drapeau', () => {
    fixture.componentRef.setInput('imageUrl', 'https://upload.wikimedia.org/rafale.jpg');
    fixture.detectChanges();
    expect(element().querySelector('img.photo')?.getAttribute('src')).toBe('https://upload.wikimedia.org/rafale.jpg');
    expect(element().querySelector('app-flag-backdrop')).toBeNull();
    expect(element().querySelector('app-vehicle-silhouette')).toBeNull();
  });

  it('sans photo, ou si elle ne se charge pas : drapeau et silhouette', () => {
    fixture.componentRef.setInput('imageUrl', 'https://upload.wikimedia.org/absente.jpg');
    fixture.detectChanges();
    element().querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element().querySelector('img')).toBeNull();
    expect(element().querySelector('app-flag-backdrop')).not.toBeNull();
    expect(element().querySelector('app-vehicle-silhouette')).not.toBeNull();
  });
});
