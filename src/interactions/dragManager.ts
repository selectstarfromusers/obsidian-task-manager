import { TFile } from "obsidian";
import { TaskItem, CLS } from "../types";

export interface DragCallbacks {
  onMoveToBucket: (file: TFile, newBucket: string) => void;
  onReorder: (file: TFile, newSortOrder: number) => void;
  onMoveToGroup?: (file: TFile, newGroup: string) => void;
}

export class DragManager {
  private callbacks: DragCallbacks;
  private draggedTask: TaskItem | null = null;
  private dropIndicator: HTMLDivElement | null = null;

  constructor(callbacks: DragCallbacks) {
    this.callbacks = callbacks;
  }

  handleDragStart(task: TaskItem, event: DragEvent): void {
    this.draggedTask = task;

    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", task.file.path);
      event.dataTransfer.effectAllowed = "move";
    }

    const row = event.target as HTMLElement;
    row.classList.add("dragging");
  }

  handleDragOver(event: DragEvent): void {
    event.preventDefault();

    const container = event.currentTarget as HTMLElement;
    container.classList.add("drag-over");

    // Remove any existing drop indicator
    this.removeDropIndicator();

    // Find the nearest task row below the cursor
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(`.${CLS}-task-row`)
    );
    const targetRow = this.findNearestRow(rows, event.clientY);

    if (targetRow) {
      this.dropIndicator = document.createElement("div");
      this.dropIndicator.className = `${CLS}-drop-indicator`;
      targetRow.parentElement?.insertBefore(this.dropIndicator, targetRow);
    } else if (rows.length > 0) {
      // Cursor is below all rows — place indicator after the last row
      const lastRow = rows[rows.length - 1];
      this.dropIndicator = document.createElement("div");
      this.dropIndicator.className = `${CLS}-drop-indicator`;
      lastRow.parentElement?.insertBefore(
        this.dropIndicator,
        lastRow.nextSibling
      );
    }
  }

  handleDrop(event: DragEvent, targetBucket: string): void {
    event.preventDefault();

    const filePath = event.dataTransfer?.getData("text/plain");
    if (!filePath || !this.draggedTask) {
      this.cleanup();
      return;
    }

    const container = event.currentTarget as HTMLElement;
    const sourceBucket = this.draggedTask.bucket;

    // Determine new sort order based on drop position among siblings
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(`.${CLS}-task-row`)
    );
    const targetRow = this.findNearestRow(rows, event.clientY);
    const newSortOrder = this.calculateSortOrder(rows, targetRow);

    if (sourceBucket !== targetBucket) {
      this.callbacks.onMoveToBucket(this.draggedTask.file, targetBucket);
    }

    // Check if dropped into a different account group
    const dropTarget = event.target as HTMLElement;
    const accountGroup = dropTarget.closest<HTMLElement>(
      `.${CLS}-account-group[data-account]`
    );
    if (accountGroup && this.callbacks.onMoveToGroup) {
      const newGroup = accountGroup.dataset.account;
      const sourceRow = document.querySelector<HTMLElement>(
        `.${CLS}-task-row[data-path="${this.draggedTask.file.path}"]`
      );
      const sourceGroup = sourceRow
        ?.closest<HTMLElement>(`.${CLS}-account-group[data-account]`)
        ?.dataset.account;

      if (newGroup && newGroup !== sourceGroup) {
        this.callbacks.onMoveToGroup(this.draggedTask.file, newGroup);
      }
    }

    this.callbacks.onReorder(this.draggedTask.file, newSortOrder);
    this.cleanup();
  }

  handleDragEnd(_event: DragEvent): void {
    this.cleanup();
  }

  /**
   * Wire drag events onto a task row element.
   * Call this for each rendered row so that dragstart and dragend are
   * both handled consistently.
   */
  attachRowEvents(
    row: HTMLElement,
    task: TaskItem,
    dragHandle: HTMLElement
  ): void {
    row.setAttribute("draggable", "true");

    dragHandle.addEventListener("mousedown", () => {
      // Allow the row to be dragged only when initiated from the handle
      row.setAttribute("draggable", "true");
    });

    row.addEventListener("dragstart", (e: DragEvent) => {
      this.handleDragStart(task, e);
    });

    row.addEventListener("dragend", (e: DragEvent) => {
      this.handleDragEnd(e);
    });
  }

  destroy(): void {
    this.cleanup();
    this.draggedTask = null;
  }

  // ── Private helpers ──────────────────────────────────

  private findNearestRow(
    rows: HTMLElement[],
    clientY: number
  ): HTMLElement | null {
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        return row;
      }
    }
    return null;
  }

  private calculateSortOrder(
    rows: HTMLElement[],
    targetRow: HTMLElement | null
  ): number {
    if (rows.length === 0) {
      return 0;
    }

    const targetIndex = targetRow ? rows.indexOf(targetRow) : rows.length;

    if (targetIndex === 0) {
      // Dropping before the first row
      const firstSort = this.getSortOrder(rows[0]);
      return firstSort - 1;
    }

    if (targetIndex >= rows.length) {
      // Dropping after the last row
      const lastSort = this.getSortOrder(rows[rows.length - 1]);
      return lastSort + 1;
    }

    // Dropping between two rows — use the midpoint
    const prevSort = this.getSortOrder(rows[targetIndex - 1]);
    const nextSort = this.getSortOrder(rows[targetIndex]);
    return (prevSort + nextSort) / 2;
  }

  private getSortOrder(row: HTMLElement): number {
    return parseFloat(row.dataset.sortOrder ?? "0");
  }

  private removeDropIndicator(): void {
    if (this.dropIndicator) {
      this.dropIndicator.remove();
      this.dropIndicator = null;
    }
    // Also clean up any orphaned indicators in the DOM
    document
      .querySelectorAll(`.${CLS}-drop-indicator`)
      .forEach((el) => el.remove());
  }

  private cleanup(): void {
    this.removeDropIndicator();

    document
      .querySelectorAll(".dragging")
      .forEach((el) => el.classList.remove("dragging"));
    document
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
  }
}
