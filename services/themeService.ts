// services/themeService.ts
// ═══════════════════════════════════════════════════════════════
// Dark/Light mode service — single source of truth
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import { colors, darkColors } from '../design/theme.ts';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'euro-office-theme';

let currentMode: ThemeMode = 'light';
let listeners: Array<(mode: ThemeMode) => void> = [];

export function getThemeMode(): ThemeMode {
  return currentMode;
}

export function getActiveColors() {
  return currentMode === 'dark' ? darkColors : colors;
}

export function initTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      currentMode = saved;
    } else {
      // Respect system preference
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        currentMode = 'dark';
      }
    }
  } catch {
    currentMode = 'light';
  }
  applyToDOM(currentMode);
  return currentMode;
}

export function toggleTheme(): ThemeMode {
  currentMode = currentMode === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, currentMode);
  } catch {}
  applyToDOM(currentMode);
  listeners.forEach(fn => fn(currentMode));
  return currentMode;
}

export function setTheme(mode: ThemeMode): void {
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
  applyToDOM(mode);
  listeners.forEach(fn => fn(mode));
}

export function onThemeChange(fn: (mode: ThemeMode) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

function applyToDOM(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}
