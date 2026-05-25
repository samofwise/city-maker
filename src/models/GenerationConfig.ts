export const DIRECTIONS = [
  { value: "north", label: "North" },
  { value: "north-east", label: "North-East" },
  { value: "east", label: "East" },
  { value: "south-east", label: "South-East" },
  { value: "south", label: "South" },
  { value: "south-west", label: "South-West" },
  { value: "west", label: "West" },
  { value: "north-west", label: "North-West" },
] as const;

export type Direction = (typeof DIRECTIONS)[number]["value"];

export interface GenerationConfig {
  coastline?: {
    direction: Direction;
    separatedFromCity: boolean;
  } | null;

  forest?: {
    direction: Direction;
    separatedFromCity: boolean;
  } | null;
}
