/** Status bar rendering for Poolside local usage. */

import * as vscode from "vscode";
import {
  formatUsageStatusBar,
  formatUsageTooltip,
  type PoolsideUsageSnapshot,
} from "./domain";

/** A quick-pick entry that maps back to a usage command action. */
export interface UsageQuickPickItem extends vscode.QuickPickItem {
  /** Action to run when the entry is picked; `undefined` for info-only rows. */
  action?: "refresh" | "openApiKeys";
}

export function renderUsageStatus(item: vscode.StatusBarItem, snapshot: PoolsideUsageSnapshot): void {
  item.text = formatUsageStatusBar(snapshot);
  item.tooltip = formatUsageTooltip(snapshot);
}
