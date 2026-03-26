import { TaskItem, DisplayConfig, CLS } from "../types";
import { createTaskRow, TaskRowCallbacks } from "./taskRow";

export function createAccountGroup(
  key: string,
  tasks: TaskItem[],
  display: DisplayConfig,
  callbacks: TaskRowCallbacks,
  collapsible: boolean
): HTMLElement {
  const group = document.createElement("div");
  group.className = `${CLS}-account-group`;

  if (key) {
    group.dataset.account = key;

    const header = document.createElement("div");
    header.className = `${CLS}-account-header`;
    header.textContent = key;

    if (collapsible) {
      header.addEventListener("click", () => {
        group.classList.toggle("collapsed");
      });
    }

    group.appendChild(header);
  }

  const tasksContainer = document.createElement("div");
  tasksContainer.className = `${CLS}-account-tasks`;

  for (const task of tasks) {
    tasksContainer.appendChild(createTaskRow(task, display, callbacks));
  }

  group.appendChild(tasksContainer);

  return group;
}
