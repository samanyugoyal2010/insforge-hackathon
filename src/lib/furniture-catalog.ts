export interface FurnitureItem {
  id: string;
  label: string;
  emoji: string;
  /** dimensions [w, h, d] in metres — used for box stand-in geometry */
  size: [number, number, number];
  color: string;
}

export const FURNITURE_CATALOG: FurnitureItem[] = [
  { id: "sofa",          label: "Sofa",          emoji: "🛋️", size: [2.2, 0.8, 0.9], color: "#8b7355" },
  { id: "armchair",      label: "Armchair",       emoji: "🪑", size: [0.9, 0.9, 0.9], color: "#a0785a" },
  { id: "dining-table",  label: "Dining Table",   emoji: "🪑", size: [1.8, 0.76, 0.9], color: "#6b4c2a" },
  { id: "coffee-table",  label: "Coffee Table",   emoji: "🪵", size: [1.2, 0.45, 0.6], color: "#7a5c3a" },
  { id: "bed-double",    label: "Double Bed",     emoji: "🛏️", size: [1.6, 0.5, 2.0], color: "#c8b89a" },
  { id: "desk",          label: "Desk",           emoji: "🖥️", size: [1.4, 0.75, 0.6], color: "#5a4030" },
  { id: "bookshelf",     label: "Bookshelf",      emoji: "📚", size: [0.8, 1.8, 0.3], color: "#4a3520" },
  { id: "tv-stand",      label: "TV Stand",       emoji: "📺", size: [1.6, 0.5, 0.4], color: "#3a3a3a" },
  { id: "lamp-floor",    label: "Floor Lamp",     emoji: "💡", size: [0.3, 1.7, 0.3], color: "#d4c49a" },
  { id: "lamp-table",    label: "Table Lamp",     emoji: "🕯️", size: [0.2, 0.5, 0.2], color: "#e8d8b0" },
  { id: "plant-large",   label: "Large Plant",    emoji: "🌿", size: [0.6, 1.4, 0.6], color: "#3a6b2a" },
  { id: "plant-small",   label: "Small Plant",    emoji: "🪴", size: [0.3, 0.4, 0.3], color: "#4a8b3a" },
  { id: "rug",           label: "Rug",            emoji: "🟥", size: [2.0, 0.02, 1.4], color: "#b04030" },
  { id: "wardrobe",      label: "Wardrobe",       emoji: "🚪", size: [1.8, 2.0, 0.6], color: "#5a4535" },
  { id: "side-table",    label: "Side Table",     emoji: "🪵", size: [0.5, 0.6, 0.5], color: "#7a5535" },
];
