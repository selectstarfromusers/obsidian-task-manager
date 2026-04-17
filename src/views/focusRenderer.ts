import { BucketGroup, DisplayConfig, CLS } from "../types";
import { createBucket, BucketCallbacks } from "./bucketComponent";

export interface FocusRendererConfig {
  buckets: BucketGroup[];
  display: DisplayConfig;
  secondaryGrouping: boolean;
  collapsible: boolean;
  callbacks: BucketCallbacks;
}

/**
 * Renders the focus view: bucket tabs at top, single bucket content below.
 */
export class FocusRenderer {
  private containerEl: HTMLElement;
  private config: FocusRendererConfig;
  private activeBucketIndex = 0;

  constructor(containerEl: HTMLElement, config: FocusRendererConfig) {
    this.containerEl = containerEl;
    this.config = config;
  }

  render(): void {
    this.containerEl.empty();
    this.containerEl.removeClass(`${CLS}-board-container`);
    this.containerEl.addClass(`${CLS}-focus-container`);

    // Bucket tabs
    const tabsEl = this.containerEl.createDiv({ cls: `${CLS}-bucket-tabs` });
    this.config.buckets.forEach((group, i) => {
      const tab = tabsEl.createDiv({
        cls: `${CLS}-bucket-tab${i === this.activeBucketIndex ? " active" : ""}`,
        text: `${group.bucket.name} (${group.totalCount})`,
      });
      tab.addEventListener("click", () => {
        this.activeBucketIndex = i;
        this.render();
      });
    });

    // Active bucket content
    const contentEl = this.containerEl.createDiv({ cls: `${CLS}-focus-content` });
    const activeGroup = this.config.buckets[this.activeBucketIndex];
    if (activeGroup) {
      const bucketEl = createBucket(
        activeGroup,
        this.config.display,
        this.config.secondaryGrouping,
        this.config.collapsible,
        this.config.callbacks
      );
      contentEl.appendChild(bucketEl);
    }
  }

  setActiveBucket(index: number): void {
    this.activeBucketIndex = index;
    this.render();
  }

  update(config: FocusRendererConfig): void {
    this.config = config;
    // Clamp active index
    if (this.activeBucketIndex >= this.config.buckets.length) {
      this.activeBucketIndex = 0;
    }
    this.render();
  }

  destroy(): void {
    this.containerEl.empty();
  }
}
