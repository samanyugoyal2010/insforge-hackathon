export interface Tour {
  id: string;
  title: string;
  address: string;
  created_at: string;
  rooms?: Room[];
}

export interface Room {
  id: string;
  tour_id: string;
  name: string;
  photo_url: string;
  display_order: number;
  hotspots?: Hotspot[];
  placements?: Placement[];
}

export interface Hotspot {
  id: string;
  from_room_id: string;
  to_room_id: string;
  theta: number;
  phi: number;
}

export interface Placement {
  id: string;
  room_id: string;
  model_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_y: number;
}
