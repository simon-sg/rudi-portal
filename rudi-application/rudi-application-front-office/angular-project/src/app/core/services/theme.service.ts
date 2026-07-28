import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rudi-theme';
const DARK_CLASS = 'dark-theme';

@Injectable({providedIn: 'root'})
export class ThemeService {

    private readonly themeSubject = new BehaviorSubject<Theme>(this.readInitialTheme());
    readonly theme$ = this.themeSubject.asObservable();

    constructor(@Inject(DOCUMENT) private readonly document: Document) {
        this.applyTheme(this.themeSubject.value);
    }

    get currentTheme(): Theme {
        return this.themeSubject.value;
    }

    toggleTheme(): void {
        this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
    }

    setTheme(theme: Theme): void {
        this.themeSubject.next(theme);
        this.applyTheme(theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
        }
    }

    private applyTheme(theme: Theme): void {
        this.document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark');
    }

    private readInitialTheme(): Theme {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') {
                return stored;
            }
        } catch {
        }
        const prefersDark = typeof window !== 'undefined' && !!window.matchMedia
            && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    }
}
