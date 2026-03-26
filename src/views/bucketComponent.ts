import { BucketGroup, DisplayConfig, CLS } from "../types";
import { createTaskRow, TaskRowCallbacks } from "./taskRow";
import { createAccountGroup } from "./accountGroup";

export interface BucketCallbacks extends TaskRowCallbacks {
  onAddTask(bucketName: string): void;
  onDragOver(event: DragEvent): void;
  onDrop(event: DragEvent, bucketName: string): void;
}

export function createBucket(
  group: BucketGroup,
  display: DisplayConfig,
  secondaryGrouping: boolean,
  collapsible: boolean,
  callbacks: BucketCallbacks
): HTMLElement {
  const bucket = document.createElement("div");
  bucket.className = `${CLS}-bucket`;
  bucket.dataset.bucket = group.bucket.name;

  // Header
  const header = document.createElement("div");
  header.className = `${CLS}-bucket-header`;

  const name = document.createElement("span");
  name.className = `${CLS}-bucket-name`;
  name.textContent = group.bucket.name;
  header.appendChild(name);

  const count = document.createElement("span");
  count.className = `${CLS}-bucket-count`;
  count.textContent = String(group.totalCount);
  header.appendChild(count);

  bucket.appendChild(header);

  // Tasks container
  const tasksContainer = document.createElement("div");
  tasksContainer.className = `${CLS}-bucket-tasks`;

  if (secondaryGrouping) {
    for (const sub of group.subGroups) {
      tasksContainer.appendChild(
        createAccountGroup(sub.key, sub.tasks, display, callbacks, collapsible)
      );
    }
  } else {
    for (const sub of group.subGroups) {
      for (const task of sub.tasks) {
        tasksContainer.appendChild(createTaskRow(task, display, callbacks));
      }
    }
  }

  // Drag-and-drop on tasks container
  tasksContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    callbacks.onDragOver(e);
  });

  tasksContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    callbacks.onDrop(e, group.bucket.name);
  });

  bucket.appendChild(tasksContainer);

  // Add task button
  const addBtn = document.createElement("div");
  addBtn.className = `${CLS}-bucket-add`;
  addBtn.textContent = "+ Add a task";
  addBtn.addEventListener("click", () => {
    callbacks.onAddTask(group.bucket.name);
  });
  bucket.appendChild(addBtn);

  return bucket;
}
