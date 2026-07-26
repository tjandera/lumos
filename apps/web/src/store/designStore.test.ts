import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useSceneStore } from "./sceneStore";
import { useDesignStore } from "./designStore";

const originalFetch = global.fetch;

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  useSceneStore.getState().reset();
  useDesignStore.setState({
    id: null,
    name: "Untitled design",
    dirty: false,
    saveStatus: "idle",
    saveError: null,
    apiOnline: null,
    designs: [],
    designsLoading: false,
    designsError: null,
    lastSyncedDocument: useSceneStore.getState().document,
    lastSyncedName: useSceneStore.getState().document.meta.name
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("dirty tracking", () => {
  it("starts clean", () => {
    expect(useDesignStore.getState().dirty).toBe(false);
  });

  it("becomes dirty when the scene document changes", () => {
    useSceneStore.getState().startRoom();
    expect(useDesignStore.getState().dirty).toBe(true);
  });

  it("becomes dirty when the name is edited", () => {
    useDesignStore.getState().setName("My Living Room");
    expect(useDesignStore.getState().dirty).toBe(true);
    expect(useDesignStore.getState().name).toBe("My Living Room");
  });

  it("does not re-dirty on a no-op rename to the same synced name", () => {
    const synced = useDesignStore.getState().lastSyncedName;
    useDesignStore.getState().setName(synced);
    expect(useDesignStore.getState().dirty).toBe(false);
  });
});

describe("newDesign", () => {
  it("resets the document, id, and name without confirmation when clean", () => {
    const ok = useDesignStore.getState().newDesign(() => {
      throw new Error("should not be called when not dirty");
    });
    expect(ok).toBe(true);
    expect(useDesignStore.getState().id).toBeNull();
    expect(useDesignStore.getState().dirty).toBe(false);
    expect(useSceneStore.getState().document.rooms).toEqual([]);
  });

  it("asks for confirmation when dirty, and aborts if declined", () => {
    useSceneStore.getState().startRoom();
    const confirmFn = vi.fn().mockReturnValue(false);
    const roomsBefore = useSceneStore.getState().document.rooms.length;

    const ok = useDesignStore.getState().newDesign(confirmFn);

    expect(confirmFn).toHaveBeenCalledOnce();
    expect(ok).toBe(false);
    expect(useSceneStore.getState().document.rooms.length).toBe(roomsBefore);
    expect(useDesignStore.getState().dirty).toBe(true);
  });

  it("proceeds when dirty and confirmation is accepted", () => {
    useSceneStore.getState().startRoom();
    const confirmFn = vi.fn().mockReturnValue(true);

    const ok = useDesignStore.getState().newDesign(confirmFn);

    expect(ok).toBe(true);
    expect(useSceneStore.getState().document.rooms).toEqual([]);
    expect(useDesignStore.getState().dirty).toBe(false);
  });
});

describe("save", () => {
  it("POSTs a new design when never saved, then tracks the returned id and clears dirty", async () => {
    useSceneStore.getState().startRoom();
    useDesignStore.getState().setName("Studio");
    expect(useDesignStore.getState().dirty).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          meta: { id: "srv-1", name: "Studio", createdAt: "t", updatedAt: "t2" },
          rooms: useSceneStore.getState().document.rooms,
          furniture: [],
          lights: []
        },
        { status: 201 }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await useDesignStore.getState().save();

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/designs"),
      expect.objectContaining({ method: "POST" })
    );
    expect(useDesignStore.getState().id).toBe("srv-1");
    expect(useDesignStore.getState().dirty).toBe(false);
    expect(useDesignStore.getState().saveStatus).toBe("saved");
    expect(useDesignStore.getState().apiOnline).toBe(true);
  });

  it("PUTs when a design id is already tracked", async () => {
    useDesignStore.setState({ id: "existing-id" });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        meta: { id: "existing-id", name: "Untitled design", createdAt: "t", updatedAt: "t2" },
        rooms: [],
        furniture: [],
        lights: []
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await useDesignStore.getState().save();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/designs/existing-id"),
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("does not wipe undo history on save (loadDocument is not called)", async () => {
    useSceneStore.getState().startRoom();
    const historyBefore = useSceneStore.getState().history.past.length;
    expect(historyBefore).toBeGreaterThan(0);

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        meta: { id: "srv-2", name: "Untitled design", createdAt: "t", updatedAt: "t2" },
        rooms: useSceneStore.getState().document.rooms,
        furniture: [],
        lights: []
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await useDesignStore.getState().save();

    expect(useSceneStore.getState().history.past.length).toBe(historyBefore);
    expect(useSceneStore.getState().canUndo()).toBe(true);
  });

  it("marks apiOnline=false and saveStatus=error on a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    const ok = await useDesignStore.getState().save();

    expect(ok).toBe(false);
    expect(useDesignStore.getState().saveStatus).toBe("error");
    expect(useDesignStore.getState().apiOnline).toBe(false);
    // Local changes are preserved — dirty flag is untouched by a failed save.
    expect(useDesignStore.getState().id).toBeNull();
  });

  it("marks apiOnline=true (server reachable) on an HTTP error response", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid design document" }, { status: 400 })) as unknown as typeof fetch;

    const ok = await useDesignStore.getState().save();

    expect(ok).toBe(false);
    expect(useDesignStore.getState().apiOnline).toBe(true);
    expect(useDesignStore.getState().saveError).toContain("Invalid design document");
  });
});

describe("open", () => {
  it("loads the fetched document into sceneStore and syncs id/name/dirty", async () => {
    const doc = {
      meta: { id: "d-1", name: "Loaded Design", createdAt: "t", updatedAt: "t2" },
      rooms: [],
      furniture: [],
      lights: []
    };
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(doc)) as unknown as typeof fetch;

    const ok = await useDesignStore.getState().open("d-1");

    expect(ok).toBe(true);
    expect(useSceneStore.getState().document.meta.id).toBe("d-1");
    expect(useDesignStore.getState().id).toBe("d-1");
    expect(useDesignStore.getState().name).toBe("Loaded Design");
    expect(useDesignStore.getState().dirty).toBe(false);
  });

  it("returns false and sets an error on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "Design not found" }, { status: 404 })) as unknown as typeof fetch;

    const ok = await useDesignStore.getState().open("missing");

    expect(ok).toBe(false);
    expect(useDesignStore.getState().saveError).toContain("Design not found");
  });
});

describe("refreshDesigns / removeDesign", () => {
  it("populates designs on success", async () => {
    const summaries = [{ id: "a", name: "A", updatedAt: "t1" }];
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ designs: summaries })) as unknown as typeof fetch;

    await useDesignStore.getState().refreshDesigns();

    expect(useDesignStore.getState().designs).toEqual(summaries);
    expect(useDesignStore.getState().apiOnline).toBe(true);
  });

  it("sets designsError and apiOnline=false on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("network down")) as unknown as typeof fetch;

    await useDesignStore.getState().refreshDesigns();

    expect(useDesignStore.getState().designsError).toBeTruthy();
    expect(useDesignStore.getState().apiOnline).toBe(false);
  });

  it("removes a design from the local list on successful delete", async () => {
    useDesignStore.setState({ designs: [{ id: "a", name: "A", updatedAt: "t1" }] });
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch;

    const ok = await useDesignStore.getState().removeDesign("a");

    expect(ok).toBe(true);
    expect(useDesignStore.getState().designs).toEqual([]);
  });

  it("clears the tracked id if the currently-open design is deleted", async () => {
    useDesignStore.setState({ id: "a", designs: [{ id: "a", name: "A", updatedAt: "t1" }] });
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch;

    await useDesignStore.getState().removeDesign("a");

    expect(useDesignStore.getState().id).toBeNull();
  });
});

describe("checkApiHealth", () => {
  it("reflects reachability", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 })) as unknown as typeof fetch;
    expect(await useDesignStore.getState().checkApiHealth()).toBe(true);
    expect(useDesignStore.getState().apiOnline).toBe(true);

    global.fetch = vi.fn().mockRejectedValue(new TypeError("down")) as unknown as typeof fetch;
    expect(await useDesignStore.getState().checkApiHealth()).toBe(false);
    expect(useDesignStore.getState().apiOnline).toBe(false);
  });
});

// Sanity: ApiError import above is exercised implicitly via client.ts's error
// paths (status-code branch tests) — keep the import so a future refactor
// that removes ApiError's export is caught by a type error here too.
void (null as unknown as ApiError);
