import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopbarComponent } from './layout/topbar/topbar.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TopbarComponent, SidebarComponent],
  template: `
    <div class="app-shell">
      <app-topbar />
      <div class="app-body">
        <app-sidebar />
        <main class="app-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}
