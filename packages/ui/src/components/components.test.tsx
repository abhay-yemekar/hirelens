import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, describe, expect, it } from "vitest";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { OverallScore, ScoreBadge } from "./score-badge";

afterAll(cleanup);

describe("Button", () => {
  it("renders with default type=button and variant classes", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toContain("bg-[var(--color-accent)]");
  });

  it("omits type when rendering asChild", () => {
    render(
      <Button asChild>
        <a href="/jobs">Jobs</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link.getAttribute("href")).toBe("/jobs");
  });

  it("applies size and variant overrides", () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-[var(--color-danger)]");
    expect(btn.className).toContain("h-11");
  });
});

describe("ScoreBadge", () => {
  it("renders the numeric level with an accessible label", () => {
    render(<ScoreBadge score={4} label="System design" />);
    const el = screen.getByRole("img", { name: "System design: score 4 of 5" });
    expect(el.textContent).toContain("4");
  });

  it("clamps out-of-range scores", () => {
    render(<ScoreBadge score={9} label="High" />);
    expect(screen.getByRole("img", { name: "High: score 5 of 5" })).toBeTruthy();
    render(<ScoreBadge score={-2} label="Low" />);
    expect(screen.getByRole("img", { name: "Low: score 0 of 5" })).toBeTruthy();
  });
});

describe("OverallScore", () => {
  it("maps 0-100 to an accessible overall score", () => {
    render(<OverallScore score={74} label="Jordan Avery" />);
    const el = screen.getByRole("img", { name: "Jordan Avery: overall score 74 of 100" });
    expect(el.textContent).toContain("74");
  });
});

describe("Card", () => {
  it("composes header, title, description, and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Backend Engineer</CardTitle>
          <CardDescription>3 candidates in review</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByText("Backend Engineer")).toBeTruthy();
    expect(screen.getByText("3 candidates in review")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });
});
