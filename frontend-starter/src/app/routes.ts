import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { FeedPageComponent } from './components/feed-page/feed-page';
import { HangarPageComponent } from './components/hangar-page/hangar-page';
import { LoginPageComponent } from './components/login-page/login-page';
import { PostPageComponent } from './components/post-page/post-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { SquadronPageComponent } from './components/squadron-page/squadron-page';
import { VehicleCreatePageComponent } from './components/vehicle-create-page/vehicle-create-page';
import { VehiclePageComponent } from './components/vehicle-page/vehicle-page';
import { VehiclesPageComponent } from './components/vehicles-page/vehicles-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'feed' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'users/:id', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'escadrille', component: SquadronPageComponent, canActivate: [authGuard] },
  { path: 'feed', component: FeedPageComponent, canActivate: [authGuard] },
  { path: 'posts/:id', component: PostPageComponent, canActivate: [authGuard] },
  { path: 'hangar', component: HangarPageComponent, canActivate: [authGuard] },
  { path: 'vehicles', component: VehiclesPageComponent, canActivate: [authGuard] },
  // Avant vehicles/:id, sinon « new » serait pris pour un identifiant.
  { path: 'vehicles/new', component: VehicleCreatePageComponent, canActivate: [authGuard] },
  { path: 'vehicles/:id', component: VehiclePageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'feed' },
];
