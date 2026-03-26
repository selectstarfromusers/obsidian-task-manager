import { App } from "obsidian";
import { TasksPluginSettings, CLS } from "../types";

/**
 * Handles the "+ Add a task" inline input at the bottom of each bucket.
 * Supports a secondary group input with autocomplete from existing values.
 */
export class InlineCreator {
  private app: App;
  private settings: () => TasksPluginSettings;

  constructor(app: App, settings: () => TasksPluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Show inline input fields (action + secondary group) and create a task stub on Enter.
   * @param containerEl  The bucket element to append inputs to.
   * @param bucketName   The bucket value for frontmatter.
   * @param existingGroups  Unique secondary group values for autocomplete suggestions.
   */
  showInput(containerEl: HTMLElement, bucketName: string, existingGroups: string[] = []): void {
    // Remove existing inputs if any (toggle behaviour)
    const existing = containerEl.querySelector(`.${CLS}-inline-input-wrapper`);
    if (existing) {
      existing.remove();
      return;
    }

    const s = this.settings();
    const wrapper = document.createElement("div");
    wrapper.className = `${CLS}-inline-input-wrapper`;

    // Action text input
    const actionInput = document.createElement("input");
    actionInput.type = "text";
    actionInput.className = `${CLS}-inline-input`;
    actionInput.placeholder = "Task description...";
    wrapper.appendChild(actionInput);

    // Secondary group input with datalist autocomplete
    const groupProp = s.secondaryGroupProperty;
    const datalistId = `${CLS}-group-suggestions-${Date.now()}`;

    const groupInput = document.createElement("input");
    groupInput.type = "text";
    groupInput.className = `${CLS}-inline-input ${CLS}-inline-group-input`;
    groupInput.placeholder = `${groupProp}...`;
    groupInput.setAttribute("list", datalistId);
    wrapper.appendChild(groupInput);

    // Datalist for autocomplete suggestions
    const datalist = document.createElement("datalist");
    datalist.id = datalistId;
    for (const value of existingGroups) {
      const option = document.createElement("option");
      option.value = value;
      datalist.appendChild(option);
    }
    wrapper.appendChild(datalist);

    // Keyboard handlers
    const handleKeydown = async (e: KeyboardEvent) => {
      if (e.key === "Enter" && actionInput.value.trim()) {
        await this.createTask(
          actionInput.value.trim(),
          bucketName,
          groupInput.value.trim()
        );
        actionInput.value = "";
        groupInput.value = "";
        actionInput.focus();
      } else if (e.key === "Escape") {
        wrapper.remove();
      }
    };

    actionInput.addEventListener("keydown", handleKeydown);
    groupInput.addEventListener("keydown", handleKeydown);

    // Tab from action input focuses group input instead of leaving
    actionInput.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        groupInput.focus();
      }
    });

    // Blur handler — remove wrapper if both inputs are empty after a short delay
    const handleBlur = () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (
          activeEl !== actionInput &&
          activeEl !== groupInput &&
          !actionInput.value.trim() &&
          !groupInput.value.trim()
        ) {
          wrapper.remove();
        }
      }, 200);
    };

    actionInput.addEventListener("blur", handleBlur);
    groupInput.addEventListener("blur", handleBlur);

    containerEl.appendChild(wrapper);
    actionInput.focus();
  }

  private async createTask(
    action: string,
    bucketName: string,
    secondaryGroup: string = ""
  ): Promise<void> {
    const s = this.settings();
    const folder = s.taskFolder;

    // Ensure folder exists
    const folderExists = this.app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      await this.app.vault.createFolder(folder);
    }

    // Naming scheme: {group}-YYYY-MM-DD-HHmmss.md or task-YYYY-MM-DD-HHmmss.md
    const now = new Date();
    const dateStamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const timeStamp = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const prefix = secondaryGroup
      ? secondaryGroup.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase()
      : "task";
    const fileName = `${folder}/${prefix}-${dateStamp}-${timeStamp}.md`;

    const today = now.toISOString().split("T")[0];
    const groupProp = s.secondaryGroupProperty;

    const frontmatterLines = [
      "---",
      `${s.bucketProperty}: "${bucketName}"`,
      `action: "${action.replace(/"/g, '\\"')}"`,
      `${groupProp}: "${secondaryGroup.replace(/"/g, '\\"')}"`,
      "source: manual",
      'source_note: ""',
      `date: ${today}`,
      'deadline: ""',
      "done: false",
      "type: task",
      "sort_order: 0",
      "---",
      "",
      action,
    ];

    const content = frontmatterLines.join("\n");
    await this.app.vault.create(fileName, content);
  }
}
