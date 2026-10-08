export interface HeroCodePanel {
  readonly label: string;
  readonly file: string;
  readonly guide?: string;
  readonly highlightedCode: string;
}

export interface HeroExample {
  readonly id: string;
  readonly title: string;
  readonly guide: string;
  readonly panels: readonly HeroCodePanel[];
}
