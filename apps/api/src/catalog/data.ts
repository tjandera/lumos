import type { CatalogItem } from "./types.js";

/**
 * Seed furniture catalog for the MVP. Static for now — a future phase can
 * swap this for a database-backed or retailer-fed source without changing
 * the route contract.
 */
export const catalogItems: CatalogItem[] = [
  {
    id: "sofa-oslo-3seat",
    name: "Oslo 3-Seat Sofa",
    category: "sofa",
    dimensions: { w: 2.1, d: 0.9, h: 0.85 },
    price: 899,
    color: "#8a8577",
    description: "A relaxed three-seat sofa with a deep seat and linen-blend upholstery."
  },
  {
    id: "armchair-birch",
    name: "Birch Lounge Armchair",
    category: "armchair",
    dimensions: { w: 0.8, d: 0.85, h: 0.78 },
    price: 349,
    color: "#c19a6b",
    description: "A compact armchair with a solid birch frame and bouclé cushioning."
  },
  {
    id: "table-coffee-mira",
    name: "Mira Coffee Table",
    category: "table",
    dimensions: { w: 1.1, d: 0.55, h: 0.4 },
    price: 219,
    color: "#5a4632",
    description: "A low walnut-veneer coffee table with rounded corners."
  },
  {
    id: "table-dining-hearth",
    name: "Hearth Dining Table",
    category: "table",
    dimensions: { w: 1.6, d: 0.9, h: 0.75 },
    price: 649,
    color: "#6b4a34",
    description: "A six-seat dining table in solid oak with a matte finish."
  },
  {
    id: "chair-dining-linen",
    name: "Linen Dining Chair",
    category: "chair",
    dimensions: { w: 0.45, d: 0.52, h: 0.85 },
    price: 129,
    color: "#e8e2d6",
    description: "An upholstered dining chair with tapered wooden legs."
  },
  {
    id: "chair-desk-flex",
    name: "Flex Task Chair",
    category: "chair",
    dimensions: { w: 0.6, d: 0.6, h: 1.05 },
    price: 219,
    color: "#2f2f2f",
    description: "An ergonomic task chair with adjustable height and lumbar support."
  },
  {
    id: "bed-queen-linden",
    name: "Linden Queen Bed",
    category: "bed",
    dimensions: { w: 1.6, d: 2.1, h: 1.0 },
    price: 799,
    color: "#d9c9b6",
    description: "A queen-size platform bed with an upholstered headboard."
  },
  {
    id: "bed-single-nook",
    name: "Nook Single Bed",
    category: "bed",
    dimensions: { w: 0.95, d: 2.0, h: 0.9 },
    price: 429,
    color: "#f2f0ea",
    description: "A single bed frame in painted pine, ideal for guest rooms."
  },
  {
    id: "storage-wardrobe-alden",
    name: "Alden Wardrobe",
    category: "storage",
    dimensions: { w: 1.2, d: 0.6, h: 2.1 },
    price: 749,
    color: "#3d3226",
    description: "A two-door wardrobe with hanging rail and internal shelving."
  },
  {
    id: "storage-bookshelf-tate",
    name: "Tate Bookshelf",
    category: "storage",
    dimensions: { w: 0.9, d: 0.35, h: 1.9 },
    price: 289,
    color: "#4a3c2c",
    description: "A five-shelf open bookcase in solid ash."
  },
  {
    id: "desk-workstation-elm",
    name: "Elm Workstation Desk",
    category: "desk",
    dimensions: { w: 1.4, d: 0.7, h: 0.75 },
    price: 379,
    color: "#7a5c3e",
    description: "A writing desk with a cable-management tray and single drawer."
  },
  {
    id: "lighting-floor-arc",
    name: "Arc Floor Lamp",
    category: "lighting",
    dimensions: { w: 0.35, d: 0.35, h: 1.65 },
    price: 159,
    color: "#1c1c1c",
    description: "An arched floor lamp with a fabric shade, ideal beside a sofa."
  }
];
