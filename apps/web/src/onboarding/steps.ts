/** Pure content for the onboarding tour — kept separate so it's trivial to
 *  scan/update without touching component logic. */
export interface OnboardingStep {
  title: string;
  body: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Draw your room in Plan",
    body: "Switch to the Plan tab and use “Draw walls” to click out your room's outline. Add windows and doors, then hit Enter (or click the first point) to close the loop."
  },
  {
    title: "Switch to 3D and drag in furniture",
    body: "Open the 3D tab, then drag items from the Catalog panel onto the floor — or click an item to drop it into the room. Drag to move, scroll to rotate, R to rotate, Delete to remove."
  },
  {
    title: "Scrub the sun with the time slider",
    body: "The Lighting panel's time-of-day slider sweeps real sunlight across your room based on date, location, and the plan's north offset — watch the shadows move."
  },
  {
    title: "Save & share",
    body: "Save gives your design a name and keeps it on this device (or the API, if it's online). Share a read-only link so someone else can view the layout without an account."
  }
];
