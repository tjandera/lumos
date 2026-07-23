/** Pure content for the onboarding walkthrough — kept separate so it's
 *  trivial to scan/update without touching component logic.
 *
 *  Steps 2-4 of the original 4-step tour (furniture / sun / save) are now
 *  interactive/detection-driven (see `walkthrough.ts` + `Onboarding.tsx`)
 *  rather than static text, so only the "draw your own room" plan-tab coach
 *  mark remains here — shown when the user picks "I'll draw my own" over
 *  the prebuilt sample room. */
export interface OnboardingStep {
  title: string;
  body: string;
}

export const PLAN_COACH_STEP: OnboardingStep = {
  title: "Draw your room in Plan",
  body: "Use “Draw walls” to click out your room's outline. Add windows and doors, then hit Enter (or click the first point) to close the loop."
};

export const FURNITURE_STEP_COPY = {
  title: "Drag in your first item",
  body: "Open the Catalog panel and drag an item onto the floor — or click an item to drop it into the room. Drag to move, scroll to rotate, R to rotate, Delete to remove.",
  successTitle: "Nice, that's furniture placed!",
  successBody: "You just furnished your first piece. Try dragging a few more in, or continue the tour."
};

export const SUN_STEP_COPY = {
  title: "Try the time-of-day slider",
  body: "In the Lighting panel, drag the time-of-day slider — it sweeps real sunlight across your room based on date, location, and the plan's north offset.",
  successTitle: "See the shadows move?",
  successBody: "That's real sun position for your room's location and date, not a canned animation."
};

export const SAVE_STEP_COPY = {
  title: "Save & meet your Assistant",
  body: "Save keeps your design on this device (or the API, if it's online) — share a read-only link any time. The Assistant panel can suggest layouts, move furniture, or answer \"what fits here?\" questions on request."
};

export const CHOICE_STEP_COPY = {
  title: "Build your first room",
  body: "Start from a ready-made living room, or draw your own from scratch — either way we'll walk you through furnishing it, lighting it, and saving it.",
  sampleButton: "Start with a sample room",
  drawButton: "I'll draw my own"
};
