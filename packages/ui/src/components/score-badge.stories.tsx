import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverallScore, ScoreBadge } from "./score-badge.js";

const meta = {
  title: "Components/ScoreBadge",
  component: ScoreBadge,
} satisfies Meta<typeof ScoreBadge>;

export default meta;

/** Render-only stories (they compose their own children) skip meta args typing. */
export const Ramp: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <ScoreBadge key={s} score={s} label={`Criterion ${s}`} />
      ))}
    </div>
  ),
};

type TypedStory = StoryObj<typeof meta>;

export const SingleLevel: TypedStory = {
  args: { score: 4, label: "System design" },
};

export const Overall: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {[12, 38, 55, 74, 91].map((s) => (
        <OverallScore key={s} score={s} label="Candidate" />
      ))}
    </div>
  ),
};
