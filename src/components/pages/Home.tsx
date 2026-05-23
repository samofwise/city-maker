import { Header } from "../organisms/Header";

export const Home = () => {
  return (
    <>
      <Header />
      <article className="flex w-full max-w-7xl flex-col items-center px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">Home Page</h1>
        <p className="max-w-2xl text-base text-gray-600">Add content here</p>
      </article>
    </>
  );
};
