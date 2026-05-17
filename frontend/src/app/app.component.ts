import { Component } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router'; // Importar Router y NavigationEnd
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './layout/topbar/topbar.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { AuthService } from './core/services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TopbarComponent, SidebarComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  // Variable para controlar la visibilidad del Topbar
  isLoginRoute = false;

  constructor(public auth: AuthService, private router: Router) {
    // Detectamos el cambio de ruta inicial y futuros
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // Si la URL contiene 'login', marcamos como true
      this.isLoginRoute = event.urlAfterRedirects.includes('login');
    });
  }
}