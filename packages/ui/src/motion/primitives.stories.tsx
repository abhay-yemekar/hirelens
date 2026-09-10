import type { Meta, StoryObj } from "@storybook/react-vite";
import { FadeIn, Stagger } from "./primitives.js";

const meta = {
  title: "Motion/Primitives",
  component: FadeIn,
} satisfies Meta<typeof FadeIn>;

export default meta;

type TypedStory = StoryObj<typeof meta>;

export const Basic: TypedStory = {
  args: { children: "Fades in with a spring" },
};

export const List: StoryObj = {
  render: () => (
    <Stagger className="flex flex-col gap-2">
      {["Jordan Avery", "Priya Natarajan", "Sam Okafor", "Lena Fischer"].map((name) => (
        <div
          key={name}
          className="rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-4 py-2"
        >
          {name}
        </div>
      ))}
    </Stagger>
  ),
};
