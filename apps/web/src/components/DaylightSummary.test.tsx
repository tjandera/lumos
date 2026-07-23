import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DaylightSummary } from "./DaylightSummary";

describe("DaylightSummary", () => {
  it("renders light direction and calls onSetTime", async () => {
    const sun = { date: "2026-06-21", time: "15:00", latitude: 51.5, longitude: 0, northOffset: 0 };
    const onSetTime = vi.fn();
    const user = userEvent.setup();

    render(<DaylightSummary sun={sun} onSetTime={onSetTime} />);
    
    expect(screen.getByText(/light from the/i)).toBeVisible();
    
    await user.click(screen.getByRole("button", { name: "Afternoon" }));
    expect(onSetTime).toHaveBeenCalledWith("15:00");
  });
});
