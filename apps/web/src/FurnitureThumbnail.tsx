import { FurnitureIcon } from './furnitureIcons';

/**
 * Small standalone preview of a catalog item, reusing the same top-down schematic
 * icons the Plan editor already draws each furniture item with — so what you see
 * before adding an item is the same shape you'll see once it's placed. viewBox is
 * sized to the item's own footprint (with padding) so a bar stool and a 2m rug both
 * fill their thumbnail similarly instead of one looking tiny.
 */
export function FurnitureThumbnail({ catalogId, w, d, color }: { catalogId: string; w: number; d: number; color: string }) {
  const pad = 1.2;
  const half = (Math.max(w, d) * pad) / 2;
  return (
    <svg viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`} className="h-9 w-9 shrink-0" aria-hidden="true">
      <FurnitureIcon catalogId={catalogId} w={w} d={d} fill={color} stroke="#00000055" />
    </svg>
  );
}
