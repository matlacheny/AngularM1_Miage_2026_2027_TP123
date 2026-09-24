import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Clears the local session and redirects to /login when an authenticated
 * request is rejected with 401 (missing, invalid or expired token).
 * Requests without an Authorization header (login/register) are left
 * untouched so their own components can show the error message.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const isUnauthorized = error instanceof HttpErrorResponse && error.status === 401;
      const wasAuthenticated = request.headers.has('Authorization');

      if (isUnauthorized && wasAuthenticated) {
        console.warn('[errorInterceptor] Session expirée ou invalide, déconnexion');
        auth.logout();
        void router.navigateByUrl('/login');
      }

      return throwError(() => error);
    }),
  );
};
