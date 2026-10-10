import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { errorInterceptor } from './app/shared/interceptors/error.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    // withComponentInputBinding() : le paramètre :id d'une route arrive dans un input() du composant.
    provideRouter(routes, withComponentInputBinding()),
    // withXhr() : le backend fetch (par défaut) ne sait pas émettre les
    // événements UploadProgress utilisés par la barre de progression de l'upload.
    provideHttpClient(withXhr(), withInterceptors([authInterceptor, errorInterceptor])),
  ],
}).catch(console.error);
