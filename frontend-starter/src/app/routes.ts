import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { HangarPageComponent } from './components/hangar-page/hangar-page';
import { LoginPageComponent } from './components/login-page/login-page';
import { ProfilePageComponent } from './components/profile-page/profile-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { VehiclePageComponent } from './components/vehicle-page/vehicle-page';
import { VehiclesPageComponent } from './components/vehicles-page/vehicles-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'hangar' },
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
  { path: 'hangar', component: HangarPageComponent, canActivate: [authGuard] },
  { path: 'vehicles', component: VehiclesPageComponent, canActivate: [authGuard] },
  { path: 'vehicles/:id', component: VehiclePageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'hangar' },
];
