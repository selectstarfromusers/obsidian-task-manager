import { App, TFile, TAbstractFile, EventRef, CachedMetadata } from "obsidian";
import {
  TaskItem,
  BucketConfig,
  BucketGroup,
  SubGroup,
  TasksPluginSettings,
} from "../types";

type ChangeCallback = () => void;

function stripWikilinks(value: string | undefined | null): string {
  if (!value) return "";
  return String(value).replace(/^\[\[/, "").replace(/\]\]$/, "");
}

export class TaskStore {
  private app: App;
  private getSettings: () => TasksPluginSettings;
  private tasks: TaskItem[] = [];
  private listeners: ChangeCallback[] = [];
  private metadataRef: EventRef | null = null;
  private deleteRef: EventRef | null = null;
  private completingPaths: Set<string> = new Set();
  private sourceIndex: Map<string, Set<string>> = new Map();

  constructor(app: App, getSettings: () => TasksPluginSettings) {
    this.app = app;
    this.getSettings = getSettings;
    this.registerMetadataListener();
    this.registerDeleteListener();
  }

  // P0: Filter metadata listener by task folder
  private registerMetadataListener(): void {
    this.metadataRef = this.app.metadataCache.on(
      "changed",
      (file: TFile, _data: string, _cache: CachedMetadata) => {
        const folder = this.getSettings().taskFolder;
        if (!file.path.startsWith(folder + "/")) return;
        this.loadTasks();
        this.notifyListeners();
      }
    );
  }

  // P1: Listen to vault delete to remove files from sourceIndex
  private registerDeleteListener(): void {
    this.deleteRef = this.app.vault.on("delete", (file: TAbstractFile) => {
      if (!(file instanceof TFile)) return;
      // Remove from sourceIndex values
      for (const [sourcePath, stubPaths] of this.sourceIndex) {
        if (stubPaths.delete(file.path)) {
          if (stubPaths.size === 0) {
            this.sourceIndex.delete(sourcePath);
          }
        }
      }
      // Also remove if it was a source key
      this.sourceIndex.delete(file.path);
    });
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  onChange(callback: ChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  // P0: Track completing tasks to prevent re-render removing them mid-animation
  markCompleting(path: string): void {
    this.completingPaths.add(path);
  }

  clearCompleting(path: string): void {
    this.completingPaths.delete(path);
  }

  async loadTasks(): Promise<TaskItem[]> {
    const settings = this.getSettings();
    const folder = settings.taskFolder;
    const bucketProp = settings.bucketProperty.toLowerCase();

    const allFiles = this.app.vault.getFiles();
    const taskFiles = allFiles.filter(
      (f) => f.path.startsWith(folder + "/") && f.extension === "md"
    );

    const tasks: TaskItem[] = [];

    // P1: Rebuild source index during loadTasks
    const newSourceIndex = new Map<string, Set<string>>();

    for (const file of taskFiles) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || fm.type !== "task") continue;

      // P1: Property name normalization — read bucket with lowercase key
      tasks.push({
        file,
        action: fm.action ?? "",
        account: stripWikilinks(fm.account),
        bucket: fm[bucketProp] ?? "",
        source: fm.source ?? "",
        sourceNote: stripWikilinks(fm.source_note),
        date: fm.date ? String(fm.date) : "",
        deadline: fm.deadline ? String(fm.deadline) : "",
        done: fm.done === true,
        sortOrder: typeof fm.sort_order === "number" ? fm.sort_order : 0,
      });

      // P1: Build source index
      const sourceFile = fm.source_file;
      if (sourceFile && typeof sourceFile === "string") {
        if (!newSourceIndex.has(sourceFile)) {
          newSourceIndex.set(sourceFile, new Set());
        }
        newSourceIndex.get(sourceFile)!.add(file.path);
      }
    }

    this.tasks = tasks;
    this.sourceIndex = newSourceIndex;
    return tasks;
  }

  getBuckets(): BucketGroup[] {
    const settings = this.getSettings();
    const configuredBuckets = [...settings.buckets].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    const bucketMap = new Map<string, TaskItem[]>();

    for (const bc of configuredBuckets) {
      bucketMap.set(bc.id, []);
    }

    const unclassified: TaskItem[] = [];

    // P0: Keep tasks whose path is in completingPaths even if done
    const activeTasks = this.tasks.filter(
      (t) => !t.done || this.completingPaths.has(t.file.path)
    );

    for (const task of activeTasks) {
      const matchingBucket = configuredBuckets.find(
        (bc) =>
          bc.id === task.bucket ||
          bc.name === task.bucket ||
          task.bucket.includes(bc.name)
      );
      if (matchingBucket) {
        bucketMap.get(matchingBucket.id)!.push(task);
      } else {
        unclassified.push(task);
      }
    }

    const groups: BucketGroup[] = [];

    for (const bc of configuredBuckets) {
      const tasks = bucketMap.get(bc.id)!;
      groups.push({
        bucket: bc,
        subGroups: this.buildSubGroups(tasks, settings),
        totalCount: tasks.length,
      });
    }

    if (settings.showUnclassified && unclassified.length > 0) {
      const unclassifiedBucket: BucketConfig = {
        id: "__unclassified__",
        name: "Unclassified",
        sortOrder: configuredBuckets.length,
      };
      groups.push({
        bucket: unclassifiedBucket,
        subGroups: this.buildSubGroups(unclassified, settings),
        totalCount: unclassified.length,
      });
    }

    return groups;
  }

  private buildSubGroups(
    tasks: TaskItem[],
    settings: TasksPluginSettings
  ): SubGroup[] {
    if (!settings.secondaryGrouping) {
      return [
        {
          key: "",
          tasks: tasks.sort((a, b) => a.sortOrder - b.sortOrder),
        },
      ];
    }

    // P1: Normalize secondary group property name to lowercase
    const prop = settings.secondaryGroupProperty.toLowerCase() as keyof TaskItem;
    const groupMap = new Map<string, TaskItem[]>();

    for (const task of tasks) {
      const key = String(task[prop] ?? "");
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(task);
    }

    const subGroups: SubGroup[] = [];
    for (const [key, groupTasks] of groupMap) {
      subGroups.push({
        key,
        tasks: groupTasks.sort((a, b) => a.sortOrder - b.sortOrder),
      });
    }

    return subGroups.sort((a, b) => a.key.localeCompare(b.key));
  }

  // P1: Get stub files for a given source path using the index
  getStubsForSource(sourcePath: string): TFile[] {
    const stubPaths = this.sourceIndex.get(sourcePath);
    if (!stubPaths) return [];
    const files: TFile[] = [];
    for (const path of stubPaths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        files.push(file);
      }
    }
    return files;
  }

  // P1: Rebuild the source index from current tasks
  rebuildIndex(): void {
    const newIndex = new Map<string, Set<string>>();
    for (const task of this.tasks) {
      const cache = this.app.metadataCache.getFileCache(task.file);
      const fm = cache?.frontmatter;
      const sourceFile = fm?.source_file;
      if (sourceFile && typeof sourceFile === "string") {
        if (!newIndex.has(sourceFile)) {
          newIndex.set(sourceFile, new Set());
        }
        newIndex.get(sourceFile)!.add(task.file.path);
      }
    }
    this.sourceIndex = newIndex;
  }

  async toggleDone(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.done = !fm.done;
    });
  }

  async toggleDoneWithSync(file: TFile): Promise<void> {
    let newDone = false;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.done = !fm.done;
      newDone = fm.done;
    });

    // Sync checkbox back to the source note for inline tasks
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (fm?.source === "inline" && fm?.source_file) {
      const sourceFile = this.app.vault.getAbstractFileByPath(fm.source_file);
      if (sourceFile instanceof TFile) {
        const lineNum = fm.source_line;
        if (typeof lineNum === "number") {
          const content = await this.app.vault.read(sourceFile);
          const lines = content.split("\n");
          if (lineNum >= 0 && lineNum < lines.length) {
            if (newDone) {
              lines[lineNum] = lines[lineNum].replace(/\[ \]/, "[x]");
            } else {
              lines[lineNum] = lines[lineNum].replace(/\[[xX]\]/, "[ ]");
            }
            await this.app.vault.modify(sourceFile, lines.join("\n"));
          }
        }
      }
    }
  }

  async moveToBucket(file: TFile, bucketName: string): Promise<void> {
    const settings = this.getSettings();
    // P1: Normalize property name to lowercase
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[settings.bucketProperty.toLowerCase()] = bucketName;
    });
  }

  async reorder(file: TFile, newSortOrder: number): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.sort_order = newSortOrder;
    });
  }

  destroy(): void {
    if (this.metadataRef) {
      this.app.metadataCache.offref(this.metadataRef);
      this.metadataRef = null;
    }
    if (this.deleteRef) {
      this.app.vault.offref(this.deleteRef);
      this.deleteRef = null;
    }
    this.listeners = [];
    this.tasks = [];
    this.completingPaths.clear();
    this.sourceIndex.clear();
  }
}
