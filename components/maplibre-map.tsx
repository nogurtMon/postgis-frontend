"use client";
import React from "react";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { MVTLayer } from "@deck.gl/geo-layers";
import { DataFilterExtension } from '@deck.gl/extensions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TILES = "https://martin-postgis-frontend-912623015104.europe-west1.run.app/main_table/{z}/{x}/{y}";

export default function MaplibreMap() {
  const mapRef = React.useRef<any>(null);
  const [selectedPoint, setSelectedPoint] = React.useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = React.useState(true);

  // Filter states
  const [selectedFeedstockTypes, setSelectedFeedstockTypes] = React.useState<string[]>([
    'Landfill gas', 'Food waste', 'Raw biogas', 'Wastewater', 'Distillery stillage'
  ]);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([
    'New', 'Researching', 'Enhanced', 'Contacted', 'Followed up', 'Engaged'
  ]);
  const [energyRange, setEnergyRange] = React.useState<[number, number]>([10000, 1000000]);

  // Define the attribute order
  const attributeOrder = [
    'id', 
    'name',
    'status',
    'notes',
    'contact_name', 
    'contact_phone', 
    'contact_email', 
    'feedstock_type', 
    'feedstock_qty', 
    'feedstock_qty_unit', 
    'feedstock_mwh_per_year', 
    'address', 
    'city', 
    'county', 
    'zipcode', 
    'state', 
    'latitude', 
    'longitude', 
    'created_at', 
    'last_updated'
  ];

  // Available options for filters
  const feedstockOptions = [
    'Landfill gas', 'Wastewater', 'Food waste', 'Raw biogas', 'Distillery stillage',
    'Dairy manure', 'Swine manure', 'Layer manure', 'Other manure', 'Broiler manure',
    'Beef manure', 'Fats, oils and greases', 'Poultry wastewater', 'Dairy wastewater',
    'Meat, poultry, egg processing waste', 'Paper mill'
  ];

  const statusOptions = [
    'New', 'Researching', 'Enhanced', 'Contacted', 'Followed up', 'Engaged', 'Disqualified'
  ];

  // Status colors with better contrast
  const statusColorMap: any = {
    'New': [255, 255, 255],        // White
    'Researching': [147, 51, 234],  // Purple (replaced gray)
    'Enhanced': [59, 130, 246],     // Blue
    'Contacted': [234, 179, 8],     // Yellow
    'Followed up': [249, 115, 22],  // Orange
    'Engaged': [34, 197, 94],       // Green
    'Disqualified': [239, 68, 68]   // Red
  };

  // 1) Stable overlay (created once)
  const overlay = React.useMemo(
    () =>
      new MapboxOverlay({
        interleaved: false,
      }),
    []
  );

  const getFillColorByStatus = (object: any) => {
    const status = object.properties?.status;
    return statusColorMap[status] || [128, 128, 128];
  };

  const handlePointClick = (info: any) => {
    if (info.object) {
      setSelectedPoint(info.object);
      setIsDialogOpen(true);
      console.log(info.object.properties);
    }
  };

  // Function to get ordered attributes
  const getOrderedAttributes = (properties: any) => {
    const ordered: [string, any][] = [];
    const remaining: [string, any][] = [];

    attributeOrder.forEach(key => {
      if (properties.hasOwnProperty(key)) {
        ordered.push([key, properties[key]]);
      }
    });

    Object.entries(properties).forEach(([key, value]) => {
      if (!attributeOrder.includes(key)) {
        remaining.push([key, value]);
      }
    });

    return [...ordered, ...remaining];
  };

  // Toggle functions for filters
  const toggleFeedstockType = (type: string) => {
    setSelectedFeedstockTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  // 2) Layers with dynamic filtering
  const layers = React.useMemo(() => {
    return [
      new MVTLayer({
        id: "martin-mvt",
        data: TILES,
        minZoom: 0,
        maxZoom: 20,
        pickable: true,
        autoHighlight: true,
        pointType: "circle",
        getPointRadius: (f: any) => {
          if (parseFloat(f.properties.feedstock_mwh_per_year) < 100000) {
            return parseFloat(f.properties.feedstock_mwh_per_year) / 5000;
          } else return 20;
        },
        pointRadiusUnits: "pixels",
        getFillColor: getFillColorByStatus,
        onClick: handlePointClick,
        extensions: [new DataFilterExtension({ filterSize: 1, categorySize: 2 })],
        getFilterValue: (f: any) => parseFloat(f.properties.feedstock_mwh_per_year),
        filterRange: energyRange,
        getFilterCategory: (object: any) => {
          const props = object.properties;
          return [props.feedstock_type, props.status];
        },
        filterCategories: [selectedFeedstockTypes, selectedStatuses],
        filterEnabled: true
      }),
    ];
  }, [selectedFeedstockTypes, selectedStatuses, energyRange]);

  // 3) Attach overlay once; update props later
  const onLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.addControl(overlay);
    overlay.setProps({ layers });
  }, [overlay, layers]);

  // 4) Push layer updates without recreating overlay
  React.useEffect(() => {
    overlay.setProps({ layers });
  }, [overlay, layers]);

  return (
    <>
      {/* Filter Controls */}
      <div className="absolute top-16 left-4 z-10 bg-slate-300/90 backdrop-blur-sm rounded-lg shadow-lg border max-w-md">
        {/* Collapse Header */}
        <div 
          className="flex items-center justify-between p-2 hover:bg-slate-400 rounded-t-lg cursor-pointer"
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
        >
          <h3 className="font-medium">{!isFiltersOpen ? 'Open filters' : 'Close filters'}</h3>
          <svg 
            className={`w-5 h-5 transition-transform ${isFiltersOpen ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Filter Content - Conditionally Rendered */}
        {isFiltersOpen && (
          <div className="p-4 space-y-4 border-t">
            {/* Feedstock Type Filter */}
            <div>
              <h4 className="font-semibold mb-2">Feedstock Type</h4>
              <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto">
                {feedstockOptions.map(type => (
                  <label key={type} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFeedstockTypes.includes(type)}
                      onChange={() => toggleFeedstockType(type)}
                      className="rounded border-gray-300"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Status Filter with Colors */}
            <div>
              <h4 className="font-semibold mb-2">Status</h4>
              <div className="grid grid-cols-2 gap-1">
                {statusOptions.map(status => (
                  <label key={status} className="flex items-center justify-left gap-1.5 text-sm group">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status)}
                        onChange={() => toggleStatus(status)}
                        className="rounded border-gray-300"
                      />
                      <span>{status}</span>
                    </div>
                    <div 
                      className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0 transition-opacity group-hover:opacity-80"
                      style={{
                        backgroundColor: `rgb(${statusColorMap[status].join(',')})`
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Energy Range Filter */}
            <div>
              <h4 className="font-semibold mb-2">
                Biomethane Potential: {energyRange[0].toLocaleString()} - {energyRange[1].toLocaleString()} MWh/year
              </h4>
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={2000000}
                  step={10000}
                  value={energyRange[0]}
                  onChange={(e) => setEnergyRange([parseInt(e.target.value), energyRange[1]])}
                  className="w-full"
                />
                <input
                  type="range"
                  min={0}
                  max={2000000}
                  step={10000}
                  value={energyRange[1]}
                  onChange={(e) => setEnergyRange([energyRange[0], parseInt(e.target.value)])}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Map
        ref={mapRef}
        onLoad={onLoad}
        initialViewState={{ longitude: -98.5556199, latitude: 39.8097343, zoom: 4 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://api.maptiler.com/maps/hybrid/style.json?key=GYDRZyFt8oPZKclvC77i"
      />

      {/* Dialog for showing point details */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-slate-300 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Point Details</DialogTitle>
            <DialogDescription>
              Complete attributes for the selected point
            </DialogDescription>
          </DialogHeader>
          
          {selectedPoint && (
            <div className="mt-4">
              <div className="grid grid-cols-1 gap-4">
                {getOrderedAttributes(selectedPoint.properties || {}).map(([key, value]) => (
                  <div key={key} className="flex flex-col space-y-1 p-2 border-b">
                    <span className="font-semibold text-sm capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}