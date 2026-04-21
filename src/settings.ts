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

    new Setting(containerEl).setName("Buckets").setHeading();

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
                "Changing the bucket property will affect how tasks are grouped. Existing tasks may appear in 'unclassified' until their frontmatter is updated."
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

      const upBtn = row.createEl("button", { text: "\u2191" });
      upBtn.setAttribute("aria-label", "Move up");
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        void (async () => {
          this.swapBuckets(index, index - 1);
          await this.plugin.saveSettings();
          this.display();
        })();
      });

      const downBtn = row.createEl("button", { text: "\u2193" });
      downBtn.setAttribute("aria-label", "Move down");
      downBtn.disabled = index === this.plugin.settings.buckets.length - 1;
      downBtn.addEventListener("click", () => {
        void (async () => {
          this.swapBuckets(index, index + 1);
          await this.plugin.saveSettings();
          this.display();
        })();
      });

      const input = row.createEl("input", { type: "text" });
      input.value = bucket.name;
      input.addEventListener("change", () => {
        void (async () => {
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
        })();
      });

      const delBtn = row.createEl("button", { text: "\u00d7" });
      delBtn.setAttribute("aria-label", "Delete bucket");
      let confirmPending = false;
      let confirmTimeout: ReturnType<typeof setTimeout> | null = null;
      delBtn.addEventListener("click", () => {
        if (!confirmPending) {
          const taskCount = this.countTasksInBucket(bucket);
          delBtn.textContent = `Confirm? (${taskCount} task${taskCount !== 1 ? "s" : ""})`;
          confirmPending = true;
          confirmTimeout = setTimeout(() => {
            delBtn.textContent = "\u00d7";
            confirmPending = false;
          }, 3000);
          return;
        }
        if (confirmTimeout) clearTimeout(confirmTimeout);
        this.plugin.settings.buckets.splice(index, 1);
        this.plugin.settings.buckets.forEach((b, i) => (b.sortOrder = i));
        if (this.plugin.settings.defaultBucketId === bucket.id) {
          this.plugin.settings.defaultBucketId =
            this.plugin.settings.buckets.length > 0
              ? this.plugin.settings.buckets[0].id
              : "";
        }
        void (async () => {
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    });

    const addBtn = bucketSection.createEl("button", {
      text: "Add bucket",
      cls: "tasks-bucket-add-btn",
    });
    addBtn.addEventListener("click", () => {
      void (async () => {
        const id = "bucket_" + Date.now().toString(36);
        this.plugin.settings.buckets.push({
          id,
          name: "New bucket",
          sortOrder: this.plugin.settings.buckets.length,
        });
        await this.plugin.saveSettings();
        this.display();
      })();
    });

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

    new Setting(containerEl).setName("Secondary grouping").setHeading();

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

    new Setting(containerEl).setName("Display").setHeading();

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

    new Setting(containerEl).setName("Getting started").setHeading();

    containerEl.createEl("p", {
      text: "Add #task to any checkbox in your notes: - [ ] do something #task",
      cls: "setting-item-description",
    });
    containerEl.createEl("p", {
      text: "Use [[group name]] to organize by the secondary grouping property.",
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

  private countTasksInBucket(bucket: BucketConfig): number {
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
