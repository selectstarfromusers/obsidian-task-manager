import { App, TFile } from "obsidian";

/**
 * Safe frontmatter updates using Obsidian's processFrontMatter API.
 */
export class FrontmatterWriter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** Update a single frontmatter property */
  async setProperty(file: TFile, key: string, value: unknown): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[key] = value;
    });
  }

  /** Toggle a boolean frontmatter property */
  async toggleBoolean(file: TFile, key: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[key] = !fm[key];
    });
  }

  /** Update multiple frontmatter properties at once */
  async setProperties(
    file: TFile,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      for (const [key, value] of Object.entries(updates)) {
        fm[key] = value;
      }
    });
  }
}
