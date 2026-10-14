import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';
import { AvatarComponent } from '../../shared/components/avatar/avatar';
import { IconComponent } from '../../shared/components/icon/icon';
import { FriendRequest, MemberResult, Squadron } from '../../shared/models/friend.model';
import { FriendService } from '../../shared/services/friend.service';
import { RelationButtonComponent } from '../relation-button/relation-button';

/** Page « Escadrille » : trouver des membres, gérer invitations et amis. */
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvatarComponent, IconComponent, RelationButtonComponent],
  templateUrl: './squadron-page.html',
  styleUrl: './squadron-page.css',
})
export class SquadronPageComponent {
  private readonly friends = inject(FriendService);

  readonly squadron = signal<Squadron>({ friends: [], incoming: [], outgoing: [] });
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busyId = signal<string | null>(null);

  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<MemberResult[]>([]);
  readonly searched = signal(false);

  constructor() {
    this.load();
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => this.findMembers(q.trim()));
  }

  load(): void {
    this.friends.squadron().subscribe({
      next: (squadron) => {
        this.squadron.set(squadron);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[SquadronPage] Escadrille indisponible', error.status);
        this.error.set(error.error?.message ?? 'Impossible de charger votre escadrille.');
        this.loading.set(false);
      },
    });
  }

  findMembers(q: string): void {
    if (q.length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.friends.search(q).subscribe({
      next: (results) => {
        this.results.set(results);
        this.searched.set(true);
      },
      error: (error: HttpErrorResponse) => console.error('[SquadronPage] Recherche impossible', error.status),
    });
  }

  accept(request: FriendRequest): void {
    this.act(request.requestId, this.friends.accept(request.requestId));
  }

  dismiss(request: FriendRequest): void {
    this.act(request.requestId, this.friends.dismiss(request.requestId));
  }

  remove(userId: string, name: string): void {
    if (!confirm(`Retirer ${name} de votre escadrille ? Vos partages mutuels seront arrêtés.`)) return;
    this.act(userId, this.friends.remove(userId));
  }

  /** Après toute action : l'escadrille et la recherche sont rechargées. */
  refresh(): void {
    this.load();
    this.findMembers(this.search.value.trim());
  }

  private act(id: string, request: Observable<unknown>): void {
    if (this.busyId()) return;
    this.busyId.set(id);
    request.subscribe({
      next: () => {
        this.busyId.set(null);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[SquadronPage] Action impossible', error.status);
        this.error.set(error.error?.message ?? 'Action impossible.');
        this.busyId.set(null);
      },
    });
  }
}
