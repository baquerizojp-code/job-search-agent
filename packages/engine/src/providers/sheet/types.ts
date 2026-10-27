import type { SheetRow, SheetTab } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';

/**
 * The tracker. Implementations: apps-script (HTTP to a bound Apps Script web
 * app) and host-connector (rows exchanged through JSON files with the agent).
 */
export interface SheetProvider {
  readonly name: string;
  /** Verify connectivity and that both tabs exist with the right headers. */
  ping(): Promise<{ ok: boolean; detail?: string }>;
  listRows(tab: SheetTab): Promise<Partial<SheetRow>[]>;
  appendRows(tab: SheetTab, rows: SheetRow[]): Promise<{ appended: number; deferred: boolean }>;
  updateStatus(jobId: string, status: string, note?: string): Promise<{ updated: boolean; deferred: boolean }>;
  /** Create tabs and headers (apps-script only). */
  setup?(): Promise<unknown>;
}

export interface SheetProviderContext {
  log: Logger;
}
