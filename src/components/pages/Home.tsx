import { Header } from "../organisms/Header";
import { MeshView } from "../organisms/MeshView";

export const Home = () => {
  return (
    <>
      <Header />
      <article className="flex w-full max-w-7xl flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-4xl font-bold text-gray-900">City Mesh</h1>
        <p className="mb-6 max-w-2xl text-base text-gray-600">
          Drag any vertex to reshape its cells. Edges and cells share
          vertices by ID, so neighbors update together.
        </p>
        <MeshView />
      </article>
    </>
  );
};
