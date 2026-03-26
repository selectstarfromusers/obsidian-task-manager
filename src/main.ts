import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { TasksPluginSettings, DEFAULT_SETTINGS, TASKS_VIEW_TYPE } from "./types";
import { TaskStore } from "./data/taskStore";
import { InlineTaskWatcher } from "./data/inlineTaskWatcher";
import { TaskView } from "./views/taskView";
import { TasksSettingTab } from "./settings";

export default class TasksPlugin extends Plugin {
  settings: TasksPluginSettings = DEFAULT_SETTINGS;
  private store: TaskStore | null = null;
  private watcher: InlineTaskWatcher | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize the task store
    this.store = new TaskStore(this.app, () => this.settings);

    // Register the custom view
    this.registerView(TASKS_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      return new TaskView(leaf, () => this.settings, this.store!);
    });

    // Add ribbon icon to open the task view
    this.addRibbonIcon("square-check-big", "Open Tasks", () => {
      this.activateView();
    });

    // Add command to open task view
    this.addCommand({
      id: "open-tasks-view",
      name: "Open task board",
      callback: () => {
        this.activateView();
      },
    });

    // Add command to toggle between focus and board mode
    this.addCommand({
      id: "toggle-tasks-mode",
      name: "Toggle focus/board mode",
      callback: () => {
        // Toggle is handled within the view
        this.activateView();
      },
    });

    // Register settings tab
    this.addSettingTab(new TasksSettingTab(this.app, this));

    // Start inline task watcher
    this.watcher = new InlineTaskWatcher(this.app, () => this.settings);
    this.watcher.start();

    // Clean up orphaned stubs when source files are deleted
    this.registerEvent(
      this.app.vault.on("delete", async (file: TAbstractFile) => {
        if (!(file instanceof TFile)) return;
        const taskFolder = this.settings.taskFolder;
        // Only act on non-stub files (files outside the task folder)
        if (file.path.startsWith(taskFolder + "/")) return;
        const stubs = this.store?.getStubsForSource(file.path) ?? [];
        for (const stub of stubs) {
          await this.app.vault.delete(stub);
        }
      })
    );

    // Update source_file in stubs when source files are renamed
    this.registerEvent(
      this.app.vault.on("rename", async (file: TAbstractFile, oldPath: string) => {
        if (!(file instanceof TFile)) return;
        const taskFolder = this.settings.taskFolder;
        // Only act on non-stub files (files outside the task folder)
        if (file.path.startsWith(taskFolder + "/")) return;
        const stubs = this.store?.getStubsForSource(oldPath) ?? [];
        for (const stub of stubs) {
          await this.app.fileManager.processFrontMatter(stub, (fm) => {
            fm.source_file = file.path;
          });
        }
      })
    );

    // After vault is ready: ensure folder exists, then load tasks
    this.app.workspace.onLayoutReady(async () => {
      await this.ensureTaskFolder();
      await this.store?.loadTasks();
    });
  }

  async onunload(): Promise<void> {
    this.watcher?.destroy();
    this.store?.destroy();
  }

  private async ensureTaskFolder(): Promise<void> {
    let folder = this.settings.taskFolder;

    // Check if the configured folder already exists
    if (this.app.vault.getAbstractFileByPath(folder)) {
      return;
    }

    // Try the default name at vault root
    const defaultName = "_Tasks";
    if (folder === defaultName || !this.app.vault.getAbstractFileByPath(defaultName)) {
      // Use the default name
      await this.app.vault.createFolder(defaultName);
      this.settings.taskFolder = defaultName;
      await this.saveSettings();
      return;
    }

    // Default name is taken — append timestamp
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    const fallbackName = `_Tasks-${stamp}`;
    await this.app.vault.createFolder(fallbackName);
    this.settings.taskFolder = fallbackName;
    await this.saveSettings();
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TASKS_VIEW_TYPE);
    if (existing.length > 0) {
      // Focus existing view
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    // Open in a new leaf
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: TASKS_VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    // Ensure nested objects are merged properly
    if (loaded?.display) {
      this.settings.display = Object.assign(
        {},
        DEFAULT_SETTINGS.display,
        loaded.display
      );
    }
    if (loaded?.buckets) {
      this.settings.buckets = loaded.buckets;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Reload tasks to pick up any config changes
    this.store?.loadTasks();
  }
}
