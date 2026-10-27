import type { z } from 'zod';
import type { SheetProviderNameSchema } from '../../schema/index.js';
import type { Logger } from '../../core/logger.js';
import { AppsScriptSheetProvider } from './apps-script.js';
import { HostConnectorSheetProvider } from './host-connector.js';
import type { SheetProvider } from './types.js';

export type { SheetProvider, SheetProviderContext } from './types.js';
export { AppsScriptSheetProvider } from './apps-script.js';
export type { AppsScriptSheetProviderOptions } from './apps-script.js';
export { HostConnectorSheetProvider, COMMIT_FILE, ROWS_FILE } from './host-connector.js';
export type { HostConnectorSheetProviderOptions, SheetCommitFile, SheetRowsFile, SheetValues } from './host-connector.js';

export type SheetProviderName = z.infer<typeof SheetProviderNameSchema>;

export interface SheetProviderDeps {
  log: Logger;
  /** apps-script: the /exec URL (secrets.appsScript.url). */
  url?: string;
  /** apps-script: the JOBSEARCH_SECRET value (secrets.appsScript.secret). */
  secret?: string;
  /** host-connector: the run directory where commit.json accumulates. */
  runDir?: string;
  /** host-connector: override the rows file exported by the agent. */
  rowsFile?: string;
  /** apps-script: injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export function createSheetProvider(name: SheetProviderName, deps: SheetProviderDeps): SheetProvider {
  switch (name) {
    case 'apps-script': {
      if (!deps.url || !deps.secret) throw new Error('Sheet provider apps-script needs a script URL and secret. Run `jobsearch sheet setup`.');
      return new AppsScriptSheetProvider({ url: deps.url, secret: deps.secret, log: deps.log, fetchImpl: deps.fetchImpl });
    }
    case 'host-connector': {
      if (!deps.runDir) throw new Error('Sheet provider host-connector needs a run directory.');
      return new HostConnectorSheetProvider({ runDir: deps.runDir, rowsFile: deps.rowsFile, log: deps.log });
    }
    default: {
      const never: never = name;
      throw new Error(`Unknown sheet provider: ${String(never)}`);
    }
  }
}
