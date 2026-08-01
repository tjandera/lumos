import { coarsenDocumentForSharing, type SceneDocument } from "@interior/core";

/**
 * Where the browser looks for apps/api.
 *
 * In dev this defaults to the same-origin `/api` path that vite.config.ts proxies to
 * 127.0.0.1:8787, so `pnpm dev` just works. It used to default to localhost:3001 — the
 * port docker-compose publishes — which meant every API-backed feature reported itself
 * as unavailable under `pnpm dev` unless you happened to also have compose running.
 *
 * In a built bundle the default stays 3001 for compose, where nginx serves the static
 * files and does not proxy. Behind the Kubernetes ingress, build with
 * VITE_API_URL=/api instead (see deploy/README.md).
 */
const BASE_URL: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "http://localhost:3001");

export type CatalogCategory =
  | "sofa"
  | "armchair"
  | "table"
  | "chair"
  | "bed"
  | "storage"
  | "desk"
  | "lighting";

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  dimensions: { w: number; d: number; h: number };
  price: number;
  color: string;
  description: string;
  /** Optional licensed-GLB path/URL; mirrors `../catalog/catalogData.ts`'s field. */
  modelUrl?: string;
}

export interface CatalogFilters {
  category?: string;
  q?: string;
  maxWidth?: number;
  maxDepth?: number;
  maxHeight?: number;
}

export interface DesignSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // The API is typically a different origin in dev (5173 vs 3001); the
    // anonymous-ownership session cookie (design CRUD + share management)
    // only flows cross-origin when the client opts in here AND the server
    // echoes a specific origin with `credentials: true` (see apps/api/src/app.ts).
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!res.ok) {
    let details: unknown;
    let message = `Request to ${path} failed with status ${res.status}`;
    try {
      const body = await res.json();
      details = body;
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Response body wasn't JSON (or was empty) — fall back to the generic message.
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function buildQuery(filters: CatalogFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  if (filters.maxWidth !== undefined) params.set("maxWidth", String(filters.maxWidth));
  if (filters.maxDepth !== undefined) params.set("maxDepth", String(filters.maxDepth));
  if (filters.maxHeight !== undefined) params.set("maxHeight", String(filters.maxHeight));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Fetch the furniture catalog, optionally filtered by category, name search, and/or max dimensions ("fits in space"). */
export async function getCatalog(filters?: CatalogFilters): Promise<CatalogItem[]> {
  const { items } = await request<{ items: CatalogItem[] }>(`/catalog${buildQuery(filters)}`);
  return items;
}

/** Fetch a single catalog item by id. Throws `ApiError` (status 404) if not found. */
export async function getCatalogItem(id: string): Promise<CatalogItem> {
  return request<CatalogItem>(`/catalog/${encodeURIComponent(id)}`);
}

/** List design summaries (id, name, updatedAt), most recently updated first. */
export async function listDesigns(): Promise<DesignSummary[]> {
  const { designs } = await request<{ designs: DesignSummary[] }>("/designs");
  return designs;
}

/** Fetch a full design document by id. Throws `ApiError` (status 404) if not found. */
export async function getDesign(id: string): Promise<SceneDocument> {
  return request<SceneDocument>(`/designs/${encodeURIComponent(id)}`);
}

/**
 * Create a new design. Pass a full `SceneDocument` to save existing scene
 * content (the server assigns a fresh id), or `{ name }` to create an empty
 * design.
 */
export async function createDesign(doc: SceneDocument | { name: string }): Promise<SceneDocument> {
  const body = "site" in doc ? coarsenDocumentForSharing(doc) : doc;
  return request<SceneDocument>("/designs", { method: "POST", body: JSON.stringify(body) });
}

/** Save (overwrite) an existing design's full document. */
export async function saveDesign(id: string, doc: SceneDocument): Promise<SceneDocument> {
  return request<SceneDocument>(`/designs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(coarsenDocumentForSharing(doc))
  });
}

/** Delete a design by id. Throws `ApiError` (status 404) if not found. */
export async function deleteDesign(id: string): Promise<void> {
  await request<void>(`/designs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface ShareInfo {
  token: string;
}

/**
 * Create (or replace) a read-only share link for a design. Owner-only —
 * relies on the session cookie sent by `request()`'s `credentials: "include"`.
 * Throws `ApiError` (status 403) if the current session doesn't own the
 * design, or 404 if the design doesn't exist.
 */
export async function createShareLink(designId: string): Promise<ShareInfo> {
  return request<ShareInfo>(`/designs/${encodeURIComponent(designId)}/share`, { method: "POST" });
}

/** Revoke the active share link (if any) for a design. Owner-only. */
export async function revokeShareLink(designId: string): Promise<void> {
  await request<void>(`/designs/${encodeURIComponent(designId)}/share`, { method: "DELETE" });
}

/**
 * Fetch a design via its share token — the public, unauthenticated,
 * read-only path (no session cookie required; works from any browser).
 * Throws `ApiError` (status 404) if the token is unknown or was revoked.
 */
export async function getSharedDesign(token: string): Promise<SceneDocument> {
  return request<SceneDocument>(`/share/${encodeURIComponent(token)}`);
}

/**
 * Lightweight reachability check against `GET /health`. Resolves `true` if
 * the API responded (even with a non-2xx status — the server is up), and
 * `false` only when the request itself failed (network error / API down).
 * Never throws — callers use this to drive an "API offline" banner without
 * needing a try/catch at every call site.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/health`);
    return true;
  } catch {
    return false;
  }
}

/** True if `err` indicates the API was unreachable (network failure) rather than an HTTP error response. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError);
}

// --- Light study: optional photoreal re-lighting of a captured frame ------------

export interface LightPresetInfo {
  id: string;
  label: string;
}

export interface LightStudyStatus {
  available: boolean;
  mock: boolean;
  presets: LightPresetInfo[];
}

/** Whether the server can re-light frames, and which moods it offers. The accurate day
 *  cycle is rendered client-side, so "unavailable" only disables the styling pass. */
export async function getLightStudyStatus(): Promise<LightStudyStatus> {
  return request<LightStudyStatus>("/light-study/status");
}

/**
 * Re-light one captured frame. The frame is always one of our own renders, so the
 * model restyles a room whose geometry and camera are already correct rather than
 * inventing one.
 */
export async function relightFrame(
  frameDataUrl: string,
  preset: string
): Promise<{ imageDataUrl: string; preset: string; mock: boolean }> {
  return request<{ imageDataUrl: string; preset: string; mock: boolean }>("/light-study/relight", {
    method: "POST",
    body: JSON.stringify({ frameDataUrl, preset })
  });
}

// --- Image Generation Day ------------------------------------------------------
// A user's own room photograph, shown under the daylight it actually gets at
// different hours. Distinct from the light study above, which re-lights frames the
// 3D renderer produced.

export interface ImageDayStatus {
  available: boolean;
  mock: boolean;
  moments: string[];
  imageModel: string;
}

export interface RoomLightContext {
  roomType: string;
  windows: string;
  materials: string;
  lamps: string;
  cameraView: string;
}

export interface ImageDaySite {
  lat: number;
  lng: number;
  trueNorthOffsetDeg: number;
  /** ISO date (YYYY-MM-DD) of the day being simulated. */
  date: string;
}

export interface ImageDayMoment {
  id: string;
  label: string;
  minutes: number;
  altitudeDeg: number;
  bearingDeg: number | null;
  afterDark: boolean;
}

export interface ImageDaySchedule {
  kind: "normal" | "polarDay" | "polarNight";
  moments: ImageDayMoment[];
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
}

export async function getImageDayStatus(): Promise<ImageDayStatus> {
  return request<ImageDayStatus>("/image-day/status");
}

/** Real sunrise/sunset and per-moment sun angles. Costs nothing — no model runs. */
export async function getImageDaySchedule(site: ImageDaySite): Promise<ImageDaySchedule> {
  return request<ImageDaySchedule>("/image-day/schedule", {
    method: "POST",
    body: JSON.stringify(site)
  });
}

/** Read the room once so every generated moment describes the same room. */
export async function analyzeRoomPhoto(imageDataUrl: string): Promise<{ context: RoomLightContext }> {
  return request<{ context: RoomLightContext }>("/image-day/analyze", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl })
  });
}

/** Generate one moment. One image-model call; the client drives the sequence. */
export async function generateImageDayMoment(
  imageDataUrl: string,
  moment: string,
  site: ImageDaySite,
  context?: RoomLightContext
): Promise<{ imageDataUrl: string; moment: ImageDayMoment; mock: boolean }> {
  return request<{ imageDataUrl: string; moment: ImageDayMoment; mock: boolean }>("/image-day/generate", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl, moment, site, context })
  });
}

// --- Accounts -------------------------------------------------------------------
// Layered over the anonymous session: everyone gets a signed cookie on first contact,
// and signing in swaps the random id inside it for the account's. Designs made before
// signing up are adopted by the account rather than stranded.

export interface Account {
  id: string;
  email: string;
}

export async function getAuthStatus(): Promise<{ available: boolean }> {
  return request<{ available: boolean }>("/auth/status");
}

export async function getCurrentUser(): Promise<Account | null> {
  const { user } = await request<{ user: Account | null }>("/auth/me");
  return user;
}

/** `adoptedDesigns` is how many anonymous designs moved to the account. */
export async function register(
  email: string,
  password: string
): Promise<{ user: Account; adoptedDesigns: number }> {
  return request<{ user: Account; adoptedDesigns: number }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function login(
  email: string,
  password: string
): Promise<{ user: Account; adoptedDesigns: number }> {
  return request<{ user: Account; adoptedDesigns: number }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function logout(): Promise<void> {
  await request<{ ok: true }>("/auth/logout", { method: "POST" });
}
