import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router'; // Importaciones necesarias para el menú
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './layout/topbar/topbar.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  // Es vital incluir RouterLink y RouterLinkActive para que no falle el HTML del menú
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TopbarComponent,
    SidebarComponent,
    CommonModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}