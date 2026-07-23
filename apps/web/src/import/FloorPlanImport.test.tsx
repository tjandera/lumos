import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloorPlanImport } from "./FloorPlanImport";
import React from "react";

describe("FloorPlanImport", () => {
  test("uploads plan, sets distance, and scales", async () => {
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<FloorPlanImport onReady={onReady} />);
    
    await user.upload(
      screen.getByLabelText("Upload floor plan"), 
      new File(["x"], "plan.png", { type: "image/png" })
    );
    
    await user.type(screen.getByLabelText("Known distance in metres"), "4");
    await user.click(screen.getByRole("button", { name: "Use this scale" }));
    
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ metresPerPixel: expect.any(Number) }));
  });
});
