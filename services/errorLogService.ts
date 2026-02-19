// services/errorLogService.ts
// ═══════════════════════════════════════════════════════════════
// Global error logging service — captures frontend errors to DB
// v1.0 — 2026-02-19
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

export interface ErrorLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  error_code: string | null;
  error_message: string;
  error_stack: string | null;
  component: string | null;
  context: Record<string, any>;
  created_at: string;
}

export const errorLogService = {

  /**
   * Log an error to the database.
   * Called from catch blocks, error boundaries, etc.
   */
  async logError(params: {
    errorMessage: string;
    errorCode?: string;
    errorStack?: string;
    component?: string;
    context?: Record<string, any>;
  }): Promise<void> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id || null;
      const userEmail = authData.user?.email || null;

      await supabase.from('error_log').insert({
        user_id: userId,
        user_email: userEmail,
        error_code: params.errorCode || null,
        error_message: params.errorMessage,
        error_stack: params.errorStack || null,
        component: params.component || null,
        context: params.context || {},
      });
    } catch (e) {
      // Fallback: log to console if DB insert fails
      console.error('[errorLogService] Failed to log error to DB:', e);
      console.error('[errorLogService] Original error:', params.errorMessage);
    }
  },

  /**
   * Fetch error logs (admin/superadmin only).
   * Returns most recent first, up to `limit` entries.
   */
  async getErrorLogs(limit: number = 100, offset: number = 0): Promise<ErrorLogEntry[]> {
    const { data, error } = await supabase
      .from('error_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[errorLogService] getErrorLogs error:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Clear all error logs (superadmin only).
   */
  async clearAllLogs(): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('error_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  /**
   * Export logs as formatted text (for sharing with developer).
   * Jasno berljiv format: datum, uporabnik, komponenta, koda, opis.
   */
  formatLogsForExport(logs: ErrorLogEntry[]): string {
    const header = [
      `EURO-OFFICE ERROR LOG EXPORT`,
      `Generated: ${new Date().toISOString()}`,
      `Total entries: ${logs.length}`,
      `${'═'.repeat(80)}`,
      '',
    ].join('\n');

    const entries = logs.map((log, i) => {
      const date = new Date(log.created_at).toLocaleString('sl-SI', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const lines = [
        `─── ERROR #${i + 1} ───`,
        `Datum:       ${date}`,
        `Uporabnik:   ${log.user_email || 'Neznan'}`,
        `Komponenta:  ${log.component || '—'}`,
        `Koda napake: ${log.error_code || '—'}`,
        `Opis:        ${log.error_message}`,
      ];
      if (log.error_stack) {
        lines.push(`Stack:       ${log.error_stack.substring(0, 500)}`);
      }
      if (log.context && Object.keys(log.context).length > 0) {
        lines.push(`Kontekst:    ${JSON.stringify(log.context)}`);
      }
      lines.push('');
      return lines.join('\n');
    }).join('\n');

    return header + entries;
  },
};

// ─── Global error handler (auto-captures unhandled errors) ───
// Filters out harmless browser noise (e.g. ResizeObserver)
const IGNORED_ERRORS = [
  'ResizeObserver loop',
  'ResizeObserver loop completed',
];

function shouldIgnore(message: string): boolean {
  return IGNORED_ERRORS.some(pattern => message.includes(pattern));
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event.message || 'Unhandled error';
    if (shouldIgnore(msg)) return; // ← skip harmless noise

    errorLogService.logError({
      errorMessage: msg,
      errorStack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
      component: 'window.onerror',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
    if (shouldIgnore(msg)) return; // ← skip harmless noise

    errorLogService.logError({
      errorMessage: msg,
      errorStack: event.reason?.stack || null,
      component: 'unhandledrejection',
    });
  });
}
