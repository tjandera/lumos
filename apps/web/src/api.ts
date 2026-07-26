import type { SceneDocument } from '@interior/core';

export interface AnalyzeRoomPhotoResponse {
  doc: SceneDocument;
  skippedFurnitureCategories: string[];
  notes?: string;
}

/** Whether the server can actually service a photo-import request right now (mock mode
 * or a real API key configured) — checked once up front so the UI can say "not set up
 * yet" instead of only failing after the user picks a photo. */
export async function checkRoomPhotoStatus(): Promise<{ available: boolean; mock: boolean }> {
  try {
    const res = await fetch('/api/room-photo/status');
    if (!res.ok) return { available: false, mock: false };
    return await res.json();
  } catch {
    return { available: false, mock: false };
  }
}

export async function analyzeRoomPhoto(imageDataUrl: string): Promise<AnalyzeRoomPhotoResponse> {
  const res = await fetch('/api/room-photo/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}
