import { BucketGroup, DisplayConfig, CLS } from "../types";
import { createBucket, BucketCallbacks } from "./bucketComponent";

export interface BoardRendererConfig {
  buckets: BucketGroup[];
  display: DisplayConfig;
  secondaryGrouping: boolean;
  collapsible: boolean;
  callbacks: BucketCallbacks;
}

/**
 * Renders the board view: all buckets as side-by-side columns.
 */
export class BoardRenderer {
  private containerEl: HTMLElement;
  private config: BoardRendererConfig;

  constructor(containerEl: HTMLElement, config: BoardRendererConfig) {
    this.containerEl = containerEl;
    this.config = config;
  }

  render(): void {
    this.containerEl.empty();
    this.containerEl.removeClass(`${CLS}-focus-container`);
    this.containerEl.addClass(`${CLS}-board-container`);

    for (const group of this.config.buckets) {
      const bucketEl = createBucket(
        group,
        this.config.display,
        this.config.secondaryGrouping,
        this.config.collapsible,
        this.config.callbacks
      );
      this.containerEl.appendChild(bucketEl);
    }
  }

  update(config: BoardRendererConfig): void {
    this.config = config;
    this.render();
  }

  destroy(): void {
    this.containerEl.empty();
  }
}
