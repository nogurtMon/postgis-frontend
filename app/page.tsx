import MaplibreMap from "../components/maplibre-map";

export default function Home() {

  return (
    <div className="font-sans min-h-screen grid grid-rows-[auto_1fr]">
      <header className="bg-slate-300 shadow-sm p-2 border-b">
        <div className="flex justify-center items-center">
          <h1 className="text-xl">
            USA BIOMETHANE PROSPECTS MAP - ABEI ENERGY
          </h1>
        </div>
      </header>
      <div className="w-full h-full">
        <MaplibreMap />
      </div>
    </div>
  );
}