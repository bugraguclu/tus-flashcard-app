/** One choice in a select row: the stored key and the label shown for it. */
export type SelectOption = { key: string; label: string };

/** The guide behind an option card's "?" button. */
export type OptionHelp = {
    title: string;
    summary: string;
    points: string[];
    note?: string;
    eyebrow: string;
    noteLabel: string;
    dismissLabel: string;
};
