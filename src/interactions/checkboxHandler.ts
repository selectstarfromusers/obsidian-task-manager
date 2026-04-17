import { TFile } from "obsidian";
import { TaskItem, CLS } from "../types";

export interface CheckboxCallbacks {
  onToggleDone: (file: TFile) => Promise<void>;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}

export class CheckboxHandler {
  private callbacks: CheckboxCallbacks;
  private pendingTimeouts: Map<string, number[]> = new Map();

  constructor(callbacks: CheckboxCallbacks) {
    this.callbacks = callbacks;
  }

  handleToggle(task: TaskItem, rowElement: HTMLElement): void {
    const key = task.file.path;

    if (!task.done) {
      // If there's already a completion animation running, the user
      // double-clicked — cancel the pending completion and uncomplete.
      if (this.pendingTimeouts.has(key)) {
        this.cancelPending(key);
        this.uncomplete(task, rowElement);
        return;
      }

      this.complete(task, rowElement);
    } else {
      this.uncomplete(task, rowElement);
    }
  }

  // ── Private helpers ──────────────────────────────────

  private complete(task: TaskItem, rowElement: HTMLElement): void {
    const key = task.file.path;
    const timeouts: number[] = [];
    const checkbox = rowElement.querySelector(`.${CLS}-checkbox`);

    // Signal animation start so the view can suppress re-renders
    this.callbacks.onAnimationStart?.();

    // Step 1: strikethrough + fade
    rowElement.classList.add("completing");

    // Step 2: fill the circle after 300ms
    timeouts.push(
      window.setTimeout(() => {
        checkbox?.classList.add("checked");
      }, 300)
    );

    // Step 3: height collapse after 1500ms
    timeouts.push(
      window.setTimeout(() => {
        rowElement.classList.add("done");
      }, 1500)
    );

    // Step 4: write frontmatter after 1700ms
    timeouts.push(
      window.setTimeout(() => {
        this.pendingTimeouts.delete(key);
        void this.callbacks.onToggleDone(task.file).then(() => {
          // Signal animation end so the view can resume re-renders
          this.callbacks.onAnimationEnd?.();
        });
      }, 1700)
    );

    this.pendingTimeouts.set(key, timeouts);
  }

  private uncomplete(task: TaskItem, rowElement: HTMLElement): void {
    const checkbox = rowElement.querySelector(`.${CLS}-checkbox`);

    rowElement.classList.remove("done", "completing");
    checkbox?.classList.remove("checked");

    void this.callbacks.onToggleDone(task.file);
  }

  private cancelPending(key: string): void {
    const timeouts = this.pendingTimeouts.get(key);
    if (timeouts) {
      for (const id of timeouts) {
        window.clearTimeout(id);
      }
      this.pendingTimeouts.delete(key);
    }
    // If we cancel mid-animation, signal the end so the view unlocks
    this.callbacks.onAnimationEnd?.();
  }
}
