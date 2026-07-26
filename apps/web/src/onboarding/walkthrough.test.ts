import { describe, expect, it } from "vitest";
import {
  INITIAL_STAGE,
  isWalkthroughDone,
  isWatchingStage,
  stageWantsTab,
  walkthroughReducer,
  type WalkthroughStage
} from "./walkthrough";

function play(events: { type: string }[]): WalkthroughStage {
  return (events as Parameters<typeof walkthroughReducer>[1][]).reduce(
    (stage, event) => walkthroughReducer(stage, event),
    INITIAL_STAGE
  );
}

describe("walkthroughReducer", () => {
  it("starts at 'choice'", () => {
    expect(INITIAL_STAGE).toBe("choice");
  });

  it("sample-room path skips the plan-tab coach mark entirely", () => {
    const stage = play([{ type: "CHOOSE_SAMPLE" }]);
    expect(stage).toBe("furniture");
  });

  it("draw-your-own path goes through the plan coach mark first", () => {
    const afterChoice = walkthroughReducer(INITIAL_STAGE, { type: "CHOOSE_DRAW" });
    expect(afterChoice).toBe("plan");
    const afterPlan = walkthroughReducer(afterChoice, { type: "NEXT" });
    expect(afterPlan).toBe("furniture");
  });

  it("furniture stage only advances on FURNITURE_ADDED, not NEXT", () => {
    const stage = play([{ type: "CHOOSE_SAMPLE" }, { type: "NEXT" }]);
    expect(stage).toBe("furniture"); // NEXT is a no-op here — detection-driven

    const advanced = play([{ type: "CHOOSE_SAMPLE" }, { type: "FURNITURE_ADDED" }]);
    expect(advanced).toBe("furniture-success");
  });

  it("full sample-room happy path reaches 'done' via FINISH", () => {
    const stage = play([
      { type: "CHOOSE_SAMPLE" },
      { type: "FURNITURE_ADDED" },
      { type: "NEXT" },
      { type: "SUN_CHANGED" },
      { type: "NEXT" },
      { type: "FINISH" }
    ]);
    expect(stage).toBe("done");
  });

  it("full draw-your-own happy path reaches 'done' via FINISH", () => {
    const stage = play([
      { type: "CHOOSE_DRAW" },
      { type: "NEXT" }, // dismiss plan coach mark
      { type: "FURNITURE_ADDED" },
      { type: "NEXT" },
      { type: "SUN_CHANGED" },
      { type: "NEXT" },
      { type: "FINISH" }
    ]);
    expect(stage).toBe("done");
  });

  it("sun stage only advances on SUN_CHANGED, not NEXT", () => {
    const stage = play([
      { type: "CHOOSE_SAMPLE" },
      { type: "FURNITURE_ADDED" },
      { type: "NEXT" },
      { type: "NEXT" } // no-op: still waiting for a sun change
    ]);
    expect(stage).toBe("sun");
  });

  it("SKIP jumps straight to 'done' from any stage", () => {
    const stages: WalkthroughStage[] = ["choice", "plan", "furniture", "furniture-success", "sun", "sun-success", "save"];
    for (const stage of stages) {
      expect(walkthroughReducer(stage, { type: "SKIP" })).toBe("done");
    }
  });

  it("'done' is terminal — further events are no-ops", () => {
    expect(walkthroughReducer("done", { type: "NEXT" })).toBe("done");
    expect(walkthroughReducer("done", { type: "FURNITURE_ADDED" })).toBe("done");
  });

  it("irrelevant events at a stage are no-ops", () => {
    expect(walkthroughReducer("choice", { type: "NEXT" })).toBe("choice");
    expect(walkthroughReducer("furniture", { type: "SUN_CHANGED" })).toBe("furniture");
    expect(walkthroughReducer("sun", { type: "FURNITURE_ADDED" })).toBe("sun");
  });
});

describe("isWalkthroughDone", () => {
  it("is true only for 'done'", () => {
    expect(isWalkthroughDone("done")).toBe(true);
    expect(isWalkthroughDone("choice")).toBe(false);
    expect(isWalkthroughDone("save")).toBe(false);
  });
});

describe("stageWantsTab", () => {
  it("wants the plan tab during the plan coach mark", () => {
    expect(stageWantsTab("plan")).toBe("plan");
  });

  it("wants the 3D tab for furniture/sun/save stages", () => {
    for (const stage of ["furniture", "furniture-success", "sun", "sun-success", "save"] as const) {
      expect(stageWantsTab(stage)).toBe("3d");
    }
  });

  it("has no tab preference for 'choice' or 'done'", () => {
    expect(stageWantsTab("choice")).toBeNull();
    expect(stageWantsTab("done")).toBeNull();
  });
});

describe("isWatchingStage", () => {
  it("is true for detection-driven stages (furniture, sun)", () => {
    expect(isWatchingStage("furniture")).toBe(true);
    expect(isWatchingStage("sun")).toBe(true);
  });

  it("is false for button-driven stages", () => {
    expect(isWatchingStage("choice")).toBe(false);
    expect(isWatchingStage("plan")).toBe(false);
    expect(isWatchingStage("furniture-success")).toBe(false);
    expect(isWatchingStage("sun-success")).toBe(false);
    expect(isWatchingStage("save")).toBe(false);
    expect(isWatchingStage("done")).toBe(false);
  });
});
