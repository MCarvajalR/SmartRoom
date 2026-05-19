import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'smartroom-theme';
  readonly mode = signal<ThemeMode>(this.getInitialMode());

  constructor(@Inject(DOCUMENT) private document: Document) {
    this.applyTheme(this.mode());
  }

  toggle() {
    const nextMode: ThemeMode = this.mode() === 'dark' ? 'light' : 'dark';
    this.mode.set(nextMode);
    localStorage.setItem(this.storageKey, nextMode);
    this.applyTheme(nextMode);
  }

  private getInitialMode(): ThemeMode {
    const saved = localStorage.getItem(this.storageKey);
    if (saved === 'light' || saved === 'dark') return saved;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applyTheme(mode: ThemeMode) {
    this.document.documentElement.dataset['theme'] = mode;
  }
}
