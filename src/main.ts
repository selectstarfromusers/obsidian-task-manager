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

    this.store = new TaskStore(this.app, () => this.settings);

    this.registerView(TASKS_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      return new TaskView(leaf, () => this.settings, this.store!);
    });

    this.addRibbonIcon("square-check-big", "Open tasks", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-tasks-view",
      name: "Open task board",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "toggle-tasks-mode",
      name: "Toggle focus/board mode",
      callback: () => {
        void this.activateView();
      },
    });

    this.addSettingTab(new TasksSettingTab(this.app, this));

    this.watcher = new InlineTaskWatcher(this.app, () => this.settings);
    this.watcher.start();

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (!(file instanceof TFile)) return;
        const taskFolder = this.settings.taskFolder;
        if (file.path.startsWith(taskFolder + "/")) return;
        const stubs = this.store?.getStubsForSource(file.path) ?? [];
        for (const stub of stubs) {
          void this.app.fileManager.trashFile(stub);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        if (!(file instanceof TFile)) return;
        const taskFolder = this.settings.taskFolder;
        if (file.path.startsWith(taskFolder + "/")) return;
        const stubs = this.store?.getStubsForSource(oldPath) ?? [];
        for (const stub of stubs) {
          void this.app.fileManager.processFrontMatter(stub, (fm) => {
            fm.source_file = file.path;
          });
        }
      })
    );

    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        await this.ensureTaskFolder();
        this.store?.loadTasks();
      })();
    });
  }

  onunload(): void {
    this.watcher?.destroy();
    this.store?.destroy();
  }

  private async ensureTaskFolder(): Promise<void> {
    const folder = this.settings.taskFolder;

    if (this.app.vault.getAbstractFileByPath(folder)) {
      return;
    }

    const defaultName = "_Tasks";
    if (folder === defaultName || !this.app.vault.getAbstractFileByPath(defaultName)) {
      await this.app.vault.createFolder(defaultName);
      this.settings.taskFolder = defaultName;
      await this.saveSettings();
      return;
    }

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
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: TASKS_VIEW_TYPE,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
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
    this.store?.loadTasks();
  }
}
