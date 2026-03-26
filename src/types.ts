import { TFile } from "obsidian";

/** A single task as read from a _Tasks/ stub file */
export interface TaskItem {
  file: TFile;
  action: string;
  account: string;
  bucket: string;
  source: string;        // "meeting" | "email" | "manual" | "inline"
  sourceNote: string;    // wikilink to origin note
  date: string;          // YYYY-MM-DD
  deadline: string;      // YYYY-MM-DD or "ASAP" or ""
  done: boolean;
  sortOrder: number;
}

/** A bucket definition from settings */
export interface BucketConfig {
  id: string;            // stable ID for persistence
  name: string;          // display name (can include emoji)
  sortOrder: number;
}

/** Tasks grouped by bucket, then optionally by secondary property */
export interface BucketGroup {
  bucket: BucketConfig;
  subGroups: SubGroup[];
  totalCount: number;
}

/** Secondary grouping (e.g. by account) within a bucket */
export interface SubGroup {
  key: string;           // e.g. "Acme Corp", or "" for ungrouped
  tasks: TaskItem[];
}

/** Display configuration */
export interface DisplayConfig {
  showDueDate: boolean;
  showAge: boolean;
  showSourceIcon: boolean;
  compactMode: boolean;
  completedBehavior: "fade" | "hide" | "strikethrough";
}

/** Full plugin settings */
export interface TasksPluginSettings {
  taskFolder: string;
  inlineTaskTag: string;
  defaultView: "focus" | "board";
  bucketProperty: string;
  buckets: BucketConfig[];
  defaultBucketId: string;
  showUnclassified: boolean;
  secondaryGrouping: boolean;
  secondaryGroupProperty: string;
  secondaryCollapsible: boolean;
  display: DisplayConfig;
}

export const DEFAULT_SETTINGS: TasksPluginSettings = {
  taskFolder: "_Tasks",
  inlineTaskTag: "#task",
  defaultView: "board",
  bucketProperty: "quadrant",
  buckets: [
    { id: "ui", name: "🔴 Urgent + Important", sortOrder: 0 },
    { id: "i", name: "🟠 Important", sortOrder: 1 },
    { id: "u", name: "🟡 Urgent", sortOrder: 2 },
    { id: "o", name: "⚪ Other", sortOrder: 3 },
  ],
  defaultBucketId: "o",
  showUnclassified: true,
  secondaryGrouping: true,
  secondaryGroupProperty: "account",
  secondaryCollapsible: true,
  display: {
    showDueDate: true,
    showAge: false,
    showSourceIcon: true,
    compactMode: false,
    completedBehavior: "fade",
  },
};

/** View type identifier */
export const TASKS_VIEW_TYPE = "obsidian-tasks-view";

/** CSS class prefix */
export const CLS = "ot";
