import { useEffect, useState } from "react";
import { MeshView } from "../organisms/MeshView";
import { Toolbar } from "../organisms/Toolbar";
import { generateCity } from "../../lib/generateCity";
import type { CityMap } from "../../types/CityMap";

export const Home = () => {
  const [city, setCity] = useState<CityMap | null>(null);

  useEffect(() => {
    setCity(generateCity(window.innerWidth, window.innerHeight, 42));
  }, []);

  if (!city) return null;

  return (
    <>
      <MeshView city={city} setCity={setCity} />
      <Toolbar city={city} setCity={setCity} />
    </>
  );
};
