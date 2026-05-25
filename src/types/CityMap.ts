import type { Mesh } from "../lib/mesh";
import type { CellData, EdgeData, VertexData, Zone } from "../lib/terrain";

export type CityMesh = Mesh<VertexData, EdgeData, CellData>;

export interface CityMap {
  mesh: CityMesh;
  zones: Map<string, Zone>;
  width: number;
  height: number;
}
