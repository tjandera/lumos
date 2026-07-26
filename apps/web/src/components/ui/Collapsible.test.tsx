import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible } from "./Collapsible";

afterEach(() => {
  cleanup();
});

describe("Collapsible", () => {
  it("starts closed by default and hides its content", () => {
    render(
      <Collapsible title="Advanced">
        <div>secret controls</div>
      </Collapsible>
    );

    expect(screen.getByRole("button", { name: /advanced/i }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("secret controls")).toBeNull();
  });

  it("respects defaultOpen", () => {
    render(
      <Collapsible title="Advanced" defaultOpen>
        <div>secret controls</div>
      </Collapsible>
    );

    expect(screen.getByText("secret controls")).toBeTruthy();
  });

  it("toggles content visibility on click", async () => {
    const user = userEvent.setup();
    render(
      <Collapsible title="Advanced">
        <div>secret controls</div>
      </Collapsible>
    );

    const toggle = screen.getByRole("button", { name: /advanced/i });
    await user.click(toggle);
    expect(screen.getByText("secret controls")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await user.click(toggle);
    expect(screen.queryByText("secret controls")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows an Advanced badge when advanced is set", () => {
    render(
      <Collapsible title="Location" advanced>
        <div>content</div>
      </Collapsible>
    );
    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("does not show a badge when advanced is not set", () => {
    render(
      <Collapsible title="Location">
        <div>content</div>
      </Collapsible>
    );
    expect(screen.queryByText("Advanced")).toBeNull();
  });
});
