import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { TasksPluginSettings, BucketConfig, DEFAULT_SETTINGS } from "./types";

type TasksPlugin = Plugin & {
  settings: TasksPluginSettings;
  saveSettings(): Promise<void>;
};

export class TasksSettingTab extends PluginSettingTab {
  plugin: TasksPlugin;

  constructor(app: App, plugin: TasksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── General ──────────────────────────────────────────────
    containerEl.createEl("h2", { text: "General" });

    new Setting(containerEl)
      .setName("Task folder")
      .setDesc("Vault folder where task notes are stored.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.taskFolder)
          .setValue(this.plugin.settings.taskFolder)
          .onChange(async (value) => {
            this.plugin.settings.taskFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Inline task tag")
      .setDesc("Tag used to mark inline tasks inside other notes.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.inlineTaskTag)
          .setValue(this.plugin.settings.inlineTaskTag)
          .onChange(async (value) => {
            this.plugin.settings.inlineTaskTag = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default view")
      .setDesc("Which view to show when the plugin opens.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("focus", "Focus")
          .addOption("board", "Board")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value: string) => {
            this.plugin.settings.defaultView = value as "focus" | "board";
            await this.plugin.saveSettings();
          })
      );

    // ── Buckets ──────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Buckets" });

    const bucketPropertySetting = new Setting(containerEl)
      .setName("Group by property")
      .setDesc("Frontmatter property used to assign tasks to buckets.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.bucketProperty)
          .setValue(this.plugin.settings.bucketProperty)
          .onChange(async (value) => {
            const newValue = value.toLowerCase().trim();
            if (newValue !== this.plugin.settings.bucketProperty) {
              new Notice(
                "Changing the bucket property will affect how tasks are grouped. Existing tasks may appear in 'Unclassified' until their frontmatter is updated."
              );
            }
            this.plugin.settings.bucketProperty = newValue;
            await this.plugin.saveSettings();
          })
      );
    bucketPropertySetting.descEl.createEl("br");
    bucketPropertySetting.descEl.createEl("small", {
      text: "Property names are case-sensitive in frontmatter. Use lowercase.",
    });

    // Bucket list (custom DOM)
    const bucketSection = containerEl.createDiv({ cls: "tasks-bucket-list" });
    bucketSection.createEl("div", {
      text: "Buckets",
      cls: "setting-item-name",
    });
    bucketSection.createEl("div", {
      text: "Drag or use arrows to reorder. Each bucket maps to a column on the board.",
      cls: "setting-item-description",
    });

    const listEl = bucketSection.createDiv({ cls: "tasks-bucket-rows" });

    this.plugin.settings.buckets.forEach((bucket, index) => {
      const row = listEl.createDiv({ cls: "tasks-bucket-row" });
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.marginBottom = "4px";

      // Up arrow
      const upBtn = row.createEl("button", { text: "\u2191" });
      upBtn.setAttribute("aria-label", "Move up");
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", async () => {
        this.swapBuckets(index, index - 1);
        await this.plugin.saveSettings();
        this.display();
      });

      // Down arrow
      const downBtn = row.createEl("button", { text: "\u2193" });
      downBtn.setAttribute("aria-label", "Move down");
      downBtn.disabled = index === this.plugin.settings.buckets.length - 1;
      downBtn.addEventListener("click", async () => {
        this.swapBuckets(index, index + 1);
        await this.plugin.saveSettings();
        this.display();
      });

      // Name input
      const input = row.createEl("input", { type: "text" });
      input.value = bucket.name;
      input.style.flex = "1";
      input.addEventListener("change", async () => {
        const newName = input.value.trim();
        const duplicate = this.plugin.settings.buckets.some(
          (b, i) => i !== index && b.name === newName
        );
        if (duplicate) {
          new Notice("A bucket with that name already exists.");
          input.value = bucket.name;
          return;
        }
        bucket.name = newName;
        await this.plugin.saveSettings();
      });

      // Delete button with confirmation
      const delBtn = row.createEl("button", { text: "\u00d7" });
      delBtn.setAttribute("aria-label", "Delete bucket");
      let confirmPending = false;
      let confirmTimeout: ReturnType<typeof setTimeout> | null = null;
      delBtn.addEventListener("click", async () => {
        if (!confirmPending) {
          // First click: count tasks and show confirmation state
          const taskCount = await this.countTasksInBucket(bucket);
          delBtn.textContent = `Confirm? (${taskCount} task${taskCount !== 1 ? "s" : ""})`;
          confirmPending = true;
          confirmTimeout = setTimeout(() => {
            delBtn.textContent = "\u00d7";
            confirmPending = false;
          }, 3000);
          return;
        }
        // Second click: actually delete
        if (confirmTimeout) clearTimeout(confirmTimeout);
        this.plugin.settings.buckets.splice(index, 1);
        this.plugin.settings.buckets.forEach((b, i) => (b.sortOrder = i));
        if (this.plugin.settings.defaultBucketId === bucket.id) {
          this.plugin.settings.defaultBucketId =
            this.plugin.settings.buckets.length > 0
              ? this.plugin.settings.buckets[0].id
              : "";
        }
        await this.plugin.saveSettings();
        this.display();
      });
    });

    // Add bucket button
    const addBtn = bucketSection.createEl("button", { text: "+ Add bucket" });
    addBtn.style.marginTop = "6px";
    addBtn.addEventListener("click", async () => {
      const id = "bucket_" + Date.now().toString(36);
      this.plugin.settings.buckets.push({
        id,
        name: "New Bucket",
        sortOrder: this.plugin.settings.buckets.length,
      });
      await this.plugin.saveSettings();
      this.display();
    });

    // Default bucket dropdown
    new Setting(containerEl)
      .setName("Default bucket for new tasks")
      .setDesc("Bucket assigned to tasks that don't match any other.")
      .addDropdown((dropdown) => {
        this.plugin.settings.buckets.forEach((b) => {
          dropdown.addOption(b.id, b.name);
        });
        dropdown.setValue(this.plugin.settings.defaultBucketId);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.defaultBucketId = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Show unclassified bucket")
      .setDesc("Display a column for tasks with no bucket value.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showUnclassified)
          .onChange(async (value) => {
            this.plugin.settings.showUnclassified = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Secondary Grouping ───────────────────────────────────
    containerEl.createEl("h2", { text: "Secondary Grouping" });

    new Setting(containerEl)
      .setName("Enable sub-groups")
      .setDesc("Group tasks within each bucket by a secondary property.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.secondaryGrouping)
          .onChange(async (value) => {
            this.plugin.settings.secondaryGrouping = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.secondaryGrouping) {
      const secondaryPropertySetting = new Setting(containerEl)
        .setName("Group by property")
        .setDesc("Frontmatter property for secondary grouping.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.secondaryGroupProperty)
            .setValue(this.plugin.settings.secondaryGroupProperty)
            .onChange(async (value) => {
              this.plugin.settings.secondaryGroupProperty = value.toLowerCase().trim();
              await this.plugin.saveSettings();
            })
        );
      secondaryPropertySetting.descEl.createEl("br");
      secondaryPropertySetting.descEl.createEl("small", {
        text: "Property names are case-sensitive in frontmatter. Use lowercase.",
      });

      new Setting(containerEl)
        .setName("Collapsible groups")
        .setDesc("Allow sub-groups to be collapsed.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.secondaryCollapsible)
            .onChange(async (value) => {
              this.plugin.settings.secondaryCollapsible = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // ── Display ──────────────────────────────────────────────
    containerEl.createEl("h2", { text: "Display" });

    new Setting(containerEl)
      .setName("Show due date")
      .setDesc("Display the due date on each task card.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showDueDate)
          .onChange(async (value) => {
            this.plugin.settings.display.showDueDate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show age")
      .setDesc("Display how long ago the task was created.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showAge)
          .onChange(async (value) => {
            this.plugin.settings.display.showAge = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show source icon")
      .setDesc("Display an icon indicating where the task originated.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.showSourceIcon)
          .onChange(async (value) => {
            this.plugin.settings.display.showSourceIcon = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Compact mode")
      .setDesc("Reduce card padding for a denser layout.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.display.compactMode)
          .onChange(async (value) => {
            this.plugin.settings.display.compactMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Completed task behavior")
      .setDesc("How completed tasks appear on the board.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("fade", "Fade out")
          .addOption("hide", "Hide immediately")
          .addOption("strikethrough", "Show with strikethrough")
          .setValue(this.plugin.settings.display.completedBehavior)
          .onChange(async (value: string) => {
            this.plugin.settings.display.completedBehavior = value as
              | "fade"
              | "hide"
              | "strikethrough";
            await this.plugin.saveSettings();
          })
      );

    // ── Getting Started ──────────────────────────────────────
    containerEl.createEl("h2", { text: "Getting Started" });

    containerEl.createEl("p", {
      text: 'Add #task to any checkbox in your notes: - [ ] Do something #task',
      cls: "setting-item-description",
    });
    containerEl.createEl("p", {
      text: "Use [[GroupName]] to organize by the secondary grouping property.",
      cls: "setting-item-description",
    });
    containerEl.createEl("p", {
      text: "Tasks appear on the board automatically.",
      cls: "setting-item-description",
    });
    containerEl.createEl("p", {
      text: "Drag between columns to change bucket assignments.",
      cls: "setting-item-description",
    });
  }

  private swapBuckets(indexA: number, indexB: number): void {
    const buckets = this.plugin.settings.buckets;
    [buckets[indexA], buckets[indexB]] = [buckets[indexB], buckets[indexA]];
    buckets.forEach((b, i) => (b.sortOrder = i));
  }

  /**
   * Count how many task files in the _Tasks/ folder have a bucket property
   * matching the given bucket's name.
   */
  private async countTasksInBucket(bucket: BucketConfig): Promise<number> {
    const folder = this.plugin.settings.taskFolder;
    const property = this.plugin.settings.bucketProperty;
    const files = this.app.vault.getFiles().filter(
      (f: TFile) => f.path.startsWith(folder + "/") && f.extension === "md"
    );
    let count = 0;
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter && cache.frontmatter[property] === bucket.name) {
        count++;
      }
    }
    return count;
  }
}
