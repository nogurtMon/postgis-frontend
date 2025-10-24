import MaplibreMap from "../components/maplibre-map";

export default function Home() {
  const statusColors = {
    'Engaged': [0, 255, 0],        // Green
    'Enhanced': [0, 0, 255],       // Blue
    'Contacted': [255, 255, 0],    // Yellow
    'Followed up': [255, 165, 0],  // Orange
    'Need to contact': [255, 0, 255], // Magenta
  };

  return (
    <div className="font-sans min-h-screen grid grid-rows-[auto_1fr]">
      <header className="bg-white shadow-sm p-4 border-b">
        <div className="flex justify-between items-center">
          {/* Title on the left */}
          <h1 className="text-xl">
            USA BIOMETHANE PROSPECTS MAP - ABEI ENERGY
          </h1>
          
          {/* Legend on the right */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-semibold">Status Legend:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center space-x-1">
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-300"
                    style={{
                      backgroundColor: `rgb(${color.join(',')})`
                    }}
                  />
                  <span className="text-xs">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="w-full h-full">
        <MaplibreMap />
      </div>
    </div>
  );
}