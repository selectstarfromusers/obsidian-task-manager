import { App, TFile, CachedMetadata, EventRef } from "obsidian";
import { TasksPluginSettings } from "../types";

interface TrackedTask {
  text: string;
  done: boolean;
  lineNum: number;
  secondaryValue: string;
}

/**
 * Watches for #task tags in notes and creates/syncs/deletes task stubs.
 *
 * Identity: each stub is tracked by source_file + source_line stored in frontmatter.
 * When a #task line changes text → stub is updated (not recreated).
 * When a #task tag is removed → stub is deleted.
 * When a line is deleted → stub is deleted.
 */
export class InlineTaskWatcher {
  private app: App;
  private settings: () => TasksPluginSettings;
  private eventRefs: EventRef[] = [];
  private processing = false;
  private recentlyWritten: Set<string> = new Set();

  constructor(app: App, settings: () => TasksPluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  start(): void {
    const ref = this.app.metadataCache.on("changed", (file, data, cache) => {
      this.onFileChanged(file, cache);
    });
    this.eventRefs.push(ref);
  }

  destroy(): void {
    for (const ref of this.eventRefs) {
      this.app.metadataCache.offref(ref);
    }
    this.eventRefs = [];
  }

  private markRecentlyWritten(path: string): void {
    this.recentlyWritten.add(path);
    setTimeout(() => {
      this.recentlyWritten.delete(path);
    }, 500);
  }

  private async onFileChanged(file: TFile, cache: CachedMetadata): Promise<void> {
    const s = this.settings();
    const tag = s.inlineTaskTag.replace("#", "");

    // Skip files in the task folder itself
    if (file.path.startsWith(s.taskFolder)) return;

    // Skip files we recently wrote to (race condition guard)
    if (this.recentlyWritten.has(file.path)) return;

    // Prevent re-entrant processing
    if (this.processing) return;
    this.processing = true;

    try {
      // Check if file has the task tag
      const fileTags = cache.tags?.map((t) => t.tag.replace("#", "")) ?? [];
      const hasTaskTag = fileTags.includes(tag);

      // Find all current #task lines in the file
      const currentTasks = hasTaskTag ? await this.findTaskLines(file, tag) : [];

      // Find all existing stubs that reference this file
      const existingStubs = this.findStubsForSource(file);

      // Reconcile: update, create, or delete stubs
      // Always reconcile if there are existing stubs (to delete orphans)
      // or if there are current tasks (to create/update stubs)
      if (currentTasks.length > 0 || existingStubs.length > 0) {
        await this.reconcile(file, currentTasks, existingStubs);
      }
    } finally {
      this.processing = false;
    }
  }

  private async findTaskLines(file: TFile, tag: string): Promise<TrackedTask[]> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const tasks: TrackedTask[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match: - [ ] text #task
      const match = line.match(/^[\s]*-\s+\[([ xX])\]\s+(.+?)(?:\s+#task)\s*$/);
      if (match) {
        const done = match[1].toLowerCase() === "x";
        let text = match[2].trim();

        // Extract [[Value]] from the text for secondary grouping
        let secondaryValue = "";
        const wikiMatch = text.match(/\[\[([^\]]+)\]\]/);
        if (wikiMatch) {
          secondaryValue = wikiMatch[1];
          // Strip the wikilink from the action text
          text = text.replace(/\s*\[\[[^\]]+\]\]\s*/, " ").trim();
        }

        tasks.push({ text, done, lineNum: i, secondaryValue });
      }
    }

    return tasks;
  }

  private findStubsForSource(sourceFile: TFile): TFile[] {
    const s = this.settings();
    const folder = s.taskFolder;
    return this.app.vault.getFiles().filter((f) => {
      if (!f.path.startsWith(folder + "/") || f.extension !== "md") return false;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.source === "inline" && fm?.source_file === sourceFile.path;
    });
  }

  private async reconcile(
    sourceFile: TFile,
    currentTasks: TrackedTask[],
    existingStubs: TFile[]
  ): Promise<void> {
    // Build a map of existing stubs by source_line
    const stubByLine = new Map<number, TFile>();
    for (const stub of existingStubs) {
      const fm = this.app.metadataCache.getFileCache(stub)?.frontmatter;
      const line = fm?.source_line;
      if (typeof line === "number") {
        stubByLine.set(line, stub);
      }
    }

    // Track which stubs we've matched
    const matchedStubs = new Set<string>();

    for (const task of currentTasks) {
      // First try exact line match
      let stub = stubByLine.get(task.lineNum);

      // If no exact match, try finding by similar text (line may have shifted)
      if (!stub) {
        stub = existingStubs.find((s) => {
          if (matchedStubs.has(s.path)) return false;
          const fm = this.app.metadataCache.getFileCache(s)?.frontmatter;
          return fm?.action === task.text || fm?.source_line === task.lineNum;
        });
      }

      if (stub) {
        // Update existing stub
        matchedStubs.add(stub.path);
        await this.updateStub(stub, task, sourceFile);
      } else {
        // Create new stub
        await this.createStub(task, sourceFile);
      }
    }

    // Delete stubs that no longer have a matching #task line
    for (const stub of existingStubs) {
      if (!matchedStubs.has(stub.path)) {
        await this.app.vault.delete(stub);
      }
    }
  }

  private async updateStub(stub: TFile, task: TrackedTask, sourceFile: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(stub)?.frontmatter;
    if (!fm) return;

    const s = this.settings();
    const groupProp = s.secondaryGroupProperty;

    const needsUpdate =
      fm.action !== task.text ||
      fm.done !== task.done ||
      fm.source_line !== task.lineNum ||
      (task.secondaryValue && fm[groupProp] !== task.secondaryValue);

    if (!needsUpdate) return;

    this.markRecentlyWritten(stub.path);
    await this.app.fileManager.processFrontMatter(stub, (frontmatter) => {
      frontmatter.action = task.text;
      frontmatter.done = task.done;
      frontmatter.source_line = task.lineNum;
      if (task.secondaryValue) {
        frontmatter[groupProp] = task.secondaryValue;
      }
    });
  }

  private generateStubFilename(secondaryValue: string, folder: string): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${yyyy}-${MM}-${dd}-${HH}${mm}${ss}`;

    let baseName: string;
    if (secondaryValue) {
      const safe = secondaryValue.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").trim();
      baseName = `${safe}-${timestamp}`;
    } else {
      baseName = `task-${timestamp}`;
    }

    let fileName = `${baseName}.md`;
    if (this.app.vault.getAbstractFileByPath(`${folder}/${fileName}`)) {
      const suffix = Math.random().toString(36).substring(2, 5);
      fileName = `${baseName}-${suffix}.md`;
    }
    return fileName;
  }

  private async createStub(task: TrackedTask, sourceFile: TFile): Promise<void> {
    const s = this.settings();
    const folder = s.taskFolder;

    // Ensure folder exists
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    // Secondary group value: [[Value]] in line > note frontmatter > empty
    const groupProp = s.secondaryGroupProperty;
    let groupValue = task.secondaryValue;
    if (!groupValue) {
      const sourceFm = this.app.metadataCache.getFileCache(sourceFile)?.frontmatter;
      const fmValue = sourceFm?.[groupProp];
      groupValue = fmValue
        ? String(fmValue).replace(/\[\[|\]\]/g, "")
        : "";
    }

    const defaultBucket = s.buckets.find((b) => b.id === s.defaultBucketId)?.name ?? "";
    const today = new Date().toISOString().split("T")[0];
    const fileName = this.generateStubFilename(task.secondaryValue, folder);
    const filePath = `${folder}/${fileName}`;

    const content = [
      "---",
      `${s.bucketProperty}: "${defaultBucket}"`,
      `action: "${task.text.replace(/"/g, '\\"')}"`,
      `${groupProp}: "${groupValue}"`,
      "source: inline",
      `source_file: "${sourceFile.path}"`,
      `source_note: "[[${sourceFile.basename}]]"`,
      `source_line: ${task.lineNum}`,
      `date: ${today}`,
      'deadline: ""',
      `done: ${task.done}`,
      "type: task",
      "sort_order: 0",
      "---",
      "",
      task.text,
    ].join("\n");

    this.markRecentlyWritten(filePath);
    await this.app.vault.create(filePath, content);
  }

  /**
   * Sync a stub's done state back to the source note.
   * Called when a task is completed on the board.
   */
  async syncDoneToSource(stubFile: TFile, done: boolean): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(stubFile);
    const fm = cache?.frontmatter;
    if (!fm?.source_file || fm.source !== "inline") return;

    const sourceFile = this.app.vault.getAbstractFileByPath(fm.source_file);
    if (!(sourceFile instanceof TFile)) return;

    const lineNum = fm.source_line;
    if (typeof lineNum !== "number") return;

    const content = await this.app.vault.read(sourceFile);
    const lines = content.split("\n");

    if (lineNum >= 0 && lineNum < lines.length) {
      const line = lines[lineNum];
      if (done) {
        lines[lineNum] = line.replace(/\[ \]/, "[x]");
      } else {
        lines[lineNum] = line.replace(/\[[xX]\]/, "[ ]");
      }
      this.markRecentlyWritten(sourceFile.path);
      await this.app.vault.modify(sourceFile, lines.join("\n"));
    }
  }
}
