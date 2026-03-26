import { TaskItem, DisplayConfig, CLS } from "../types";

export interface TaskRowCallbacks {
  onToggleDone(task: TaskItem): void;
  onDragStart(task: TaskItem, event: DragEvent): void;
  onClick(task: TaskItem): void;
}

const SOURCE_ICONS: Record<string, string> = {
  meeting: "\u{1F4DE}",
  email: "\u{2709}\u{FE0F}",
  manual: "\u{270F}\u{FE0F}",
  inline: "\u{1F517}",
};

function daysSince(dateStr: string): number {
  const then = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - then.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `by ${mm}/${dd}`;
}

function createCheckboxSvg(done: boolean): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 18 18");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "1");
  rect.setAttribute("y", "1");
  rect.setAttribute("width", "16");
  rect.setAttribute("height", "16");
  rect.setAttribute("rx", "4");
  rect.setAttribute("ry", "4");
  rect.setAttribute("fill", done ? "currentColor" : "none");
  rect.setAttribute("stroke", "currentColor");
  rect.setAttribute("stroke-width", "1.5");
  svg.appendChild(rect);

  if (done) {
    const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
    check.setAttribute("d", "M5.5 9.5l2 2 5-5");
    check.setAttribute("stroke", "var(--background-primary, #fff)");
    check.setAttribute("stroke-width", "1.5");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    svg.appendChild(check);
  }

  return svg;
}

export function createTaskRow(
  task: TaskItem,
  display: DisplayConfig,
  callbacks: TaskRowCallbacks
): HTMLElement {
  const row = document.createElement("div");
  row.className = `${CLS}-task-row`;
  row.draggable = true;
  row.dataset.path = task.file.path;

  // P2: Store sort_order in data-attribute for drag manager
  row.dataset.sortOrder = String(task.sortOrder);

  // P2: ARIA roles and labels
  row.setAttribute("role", "listitem");
  row.setAttribute("tabindex", "0");

  if (task.done) {
    row.classList.add(`${CLS}-done`);
  }

  // Drag handle
  const handle = document.createElement("div");
  handle.className = `${CLS}-drag-handle`;
  handle.textContent = "\u{2817}";
  row.appendChild(handle);

  // Checkbox
  const checkbox = document.createElement("div");
  checkbox.className = `${CLS}-checkbox`;
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-checked", String(task.done));
  checkbox.setAttribute("aria-label", "Mark task as " + (task.done ? "incomplete" : "complete"));
  checkbox.appendChild(createCheckboxSvg(task.done));
  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onToggleDone(task);
  });
  row.appendChild(checkbox);

  // Content
  const content = document.createElement("div");
  content.className = `${CLS}-content`;

  // Action text + source icon on same line
  const actionLine = document.createElement("span");
  actionLine.className = `${CLS}-action`;

  const actionText = document.createTextNode(task.action);
  actionLine.appendChild(actionText);

  if (display.showSourceIcon && task.source && SOURCE_ICONS[task.source]) {
    const icon = document.createElement("span");
    icon.className = `${CLS}-source-icon`;
    icon.textContent = ` ${SOURCE_ICONS[task.source]}`;
    actionLine.appendChild(icon);
  }

  content.appendChild(actionLine);

  // Deadline + age on a separate line
  const metaParts: string[] = [];

  if (task.deadline && display.showDueDate) {
    metaParts.push(formatDeadline(task.deadline));
  }

  if (display.showAge && task.date) {
    const age = daysSince(task.date);
    metaParts.push(`${age}d`);
  }

  if (metaParts.length > 0) {
    const meta = document.createElement("span");
    meta.className = `${CLS}-meta`;
    meta.textContent = metaParts.join(" \u{2022} ");
    content.appendChild(meta);
  }

  row.appendChild(content);

  // Events
  row.addEventListener("click", () => callbacks.onClick(task));
  row.addEventListener("dragstart", (e) => callbacks.onDragStart(task, e));

  // P2: Keyboard handler — Enter/Space triggers toggle, arrow keys left to parent
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callbacks.onToggleDone(task);
    }
  });

  return row;
}
