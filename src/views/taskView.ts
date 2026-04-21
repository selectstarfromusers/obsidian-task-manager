import { ItemView, WorkspaceLeaf, TFile, Menu } from "obsidian";
import {
  TASKS_VIEW_TYPE,
  CLS,
  TaskItem,
  TasksPluginSettings,
} from "../types";
import { TaskStore } from "../data/taskStore";
import { FocusRenderer } from "./focusRenderer";
import { BoardRenderer } from "./boardRenderer";
import { DragManager } from "../interactions/dragManager";
import { CheckboxHandler } from "../interactions/checkboxHandler";
import { BucketCallbacks } from "./bucketComponent";
import { InlineCreator } from "../interactions/inlineCreator";

export class TaskView extends ItemView {
  private settings: () => TasksPluginSettings;
  private store: TaskStore;
  private focusRenderer: FocusRenderer | null = null;
  private boardRenderer: BoardRenderer | null = null;
  private dragManager: DragManager;
  private checkboxHandler: CheckboxHandler;
  private inlineCreator: InlineCreator;
  private currentMode: "focus" | "board";
  private rootEl: HTMLElement | null = null;
  private animating = false;

  constructor(
    leaf: WorkspaceLeaf,
    settings: () => TasksPluginSettings,
    store: TaskStore
  ) {
    super(leaf);
    this.settings = settings;
    this.store = store;
    this.currentMode = settings().defaultView;

    this.dragManager = new DragManager({
      onMoveToBucket: (file, newBucket) => {
        void this.store.moveToBucket(file, newBucket);
      },
      onReorder: (file, order) => {
        void this.store.reorder(file, order);
      },
    });

    this.checkboxHandler = new CheckboxHandler({
      onToggleDone: (file) => this.store.toggleDoneWithSync(file),
    });

    this.inlineCreator = new InlineCreator(this.app, settings);
  }

  getViewType(): string {
    return TASKS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tasks";
  }

  getIcon(): string {
    return "square-check-big";
  }

  onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    this.rootEl = contentEl.createDiv({ cls: `${CLS}-view` });
    if (this.settings().display.compactMode) {
      this.rootEl.addClass("compact");
    }

    // Header: mode tabs + settings
    const headerEl = this.rootEl.createDiv({ cls: `${CLS}-header` });
    const tabsEl = headerEl.createDiv({ cls: `${CLS}-mode-tabs` });

    const focusTab = tabsEl.createDiv({
      cls: `${CLS}-mode-tab`,
      text: "Focus",
    });
    const boardTab = tabsEl.createDiv({
      cls: `${CLS}-mode-tab`,
      text: "Board",
    });

    focusTab.addEventListener("click", () => this.setMode("focus"));
    boardTab.addEventListener("click", () => this.setMode("board"));

    // Content area
    const contentArea = this.rootEl.createDiv({ cls: `${CLS}-content` });

    // Load tasks first, then render
    this.store.loadTasks();
    this.renderView(contentArea);

    // React to data changes (debounced to avoid re-render storms)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    this.store.onChange(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // P0: Skip re-render while checkbox animation is in progress
        if (this.animating) return;
        this.renderView(contentArea);
      }, 300);
    });

    return Promise.resolve();
  }

  private setMode(mode: "focus" | "board"): void {
    this.currentMode = mode;
    const contentArea = this.rootEl?.querySelector(`.${CLS}-content`) as HTMLElement;
    if (contentArea) {
      this.renderView(contentArea);
    }
    // Update tab active states
    this.rootEl?.querySelectorAll(`.${CLS}-mode-tab`).forEach((tab, i) => {
      tab.toggleClass("active", (i === 0 && mode === "focus") || (i === 1 && mode === "board"));
    });
  }

  private renderView(contentArea: HTMLElement): void {
    const s = this.settings();
    const buckets = this.store.getBuckets();

    // P1: Empty state — show when all buckets have 0 tasks
    const totalTasks = buckets.reduce((sum, b) => sum + b.totalCount, 0);
    if (totalTasks === 0) {
      contentArea.empty();
      if (this.focusRenderer) {
        this.focusRenderer.destroy();
        this.focusRenderer = null;
      }
      if (this.boardRenderer) {
        this.boardRenderer.destroy();
        this.boardRenderer = null;
      }
      const emptyState = document.createElement("div");
      emptyState.className = `${CLS}-empty-state`;
      const iconEl = document.createElement("div");
      iconEl.className = `${CLS}-empty-icon`;
      iconEl.textContent = "\u2610";
      emptyState.appendChild(iconEl);
      const titleEl = document.createElement("div");
      titleEl.className = `${CLS}-empty-title`;
      titleEl.textContent = "No tasks yet";
      emptyState.appendChild(titleEl);
      const hint1 = document.createElement("div");
      hint1.className = `${CLS}-empty-hint`;
      hint1.textContent = "Add #task to any checkbox in your notes to see it here.";
      emptyState.appendChild(hint1);
      const hint2 = document.createElement("div");
      hint2.className = `${CLS}-empty-hint`;
      hint2.textContent = "Example: - [ ] send report [[project alpha]] #task";
      emptyState.appendChild(hint2);
      contentArea.appendChild(emptyState);
      return;
    }

    const callbacks = this.createCallbacks();
    const config = {
      buckets,
      display: s.display,
      secondaryGrouping: s.secondaryGrouping,
      collapsible: s.secondaryCollapsible,
      callbacks,
    };

    if (this.currentMode === "focus") {
      if (this.boardRenderer) {
        this.boardRenderer.destroy();
        this.boardRenderer = null;
      }
      if (this.focusRenderer) {
        this.focusRenderer.update(config);
      } else {
        contentArea.empty();
        this.focusRenderer = new FocusRenderer(contentArea, config);
        this.focusRenderer.render();
      }
    } else {
      if (this.focusRenderer) {
        this.focusRenderer.destroy();
        this.focusRenderer = null;
      }
      if (this.boardRenderer) {
        this.boardRenderer.update(config);
      } else {
        contentArea.empty();
        this.boardRenderer = new BoardRenderer(contentArea, config);
        this.boardRenderer.render();
      }
    }

    // Set active tab
    this.rootEl?.querySelectorAll(`.${CLS}-mode-tab`).forEach((tab, i) => {
      tab.toggleClass(
        "active",
        (i === 0 && this.currentMode === "focus") ||
          (i === 1 && this.currentMode === "board")
      );
    });
  }

  /** Collect unique secondary group values from all tasks in the store. */
  private getExistingSecondaryGroups(): string[] {
    const buckets = this.store.getBuckets();
    const values = new Set<string>();
    for (const bucket of buckets) {
      for (const sub of bucket.subGroups) {
        if (sub.key) values.add(sub.key);
      }
    }
    return Array.from(values).sort();
  }

  private createCallbacks(): BucketCallbacks {
    return {
      onToggleDone: (task: TaskItem) => {
        const row = this.rootEl?.querySelector(
          `[data-path="${task.file.path}"]`
        ) as HTMLElement;
        if (row) {
          // P0: Block re-renders during the completion animation
          this.animating = true;
          this.checkboxHandler.handleToggle(task, row);
          // The checkbox handler uses a 1700ms delay; set a timeout to clear the flag
          setTimeout(() => {
            this.animating = false;
          }, 1800);
        }
      },
      onDragStart: (task: TaskItem, event: DragEvent) => {
        this.dragManager.handleDragStart(task, event);
      },
      onClick: (task: TaskItem) => {
        const file = this.app.vault.getAbstractFileByPath(task.file.path);
        if (file instanceof TFile) {
          void this.app.workspace.getLeaf("tab").openFile(file);
        }
      },
      onAddTask: (bucketName: string) => {
        this.createInlineTask(bucketName);
      },
      onDragOver: (event: DragEvent) => {
        this.dragManager.handleDragOver(event);
      },
      onDrop: (event: DragEvent, bucketName: string) => {
        this.dragManager.handleDrop(event, bucketName);
      },
      onContextMenu: (task: TaskItem, event: MouseEvent) => {
        const menu = new Menu();
        for (const bucket of this.settings().buckets) {
          menu.addItem((item) =>
            item.setTitle(bucket.name).onClick(() => {
              void this.store.moveToBucket(task.file, bucket.name);
            })
          );
        }
        menu.showAtMouseEvent(event);
      },
    };
  }

  /**
   * P1: Show the InlineCreator input with secondary group autocomplete,
   * then create a stub file including the secondary group in frontmatter.
   */
  private createInlineTask(bucketName: string): void {
    const contentArea = this.rootEl?.querySelector(
      `[data-bucket="${bucketName}"]`
    ) as HTMLElement;
    if (!contentArea) return;

    const existingGroups = this.getExistingSecondaryGroups();
    this.inlineCreator.showInput(contentArea, bucketName, existingGroups);
  }

  onClose(): Promise<void> {
    this.focusRenderer?.destroy();
    this.boardRenderer?.destroy();
    this.dragManager.destroy();
    return Promise.resolve();
  }
}
