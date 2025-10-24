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
    
    const statusColorMap: any = {
      'New': [255, 255, 255],        // White
      'Engaged': [0, 255, 0],    // Green
      'Enhanced': [0, 0, 255],   // Blue
      'Contacted': [255, 255, 0], // Yellow
      'Followed up': [255, 165, 0], // Orange
      'Need to contact': [255, 0, 255], // Magenta
    };
    
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

    // First, add attributes in the specified order
    attributeOrder.forEach(key => {
      if (properties.hasOwnProperty(key)) {
        ordered.push([key, properties[key]]);
      }
    });

    // Then, add any remaining attributes that weren't in the order list
    Object.entries(properties).forEach(([key, value]) => {
      if (!attributeOrder.includes(key)) {
        remaining.push([key, value]);
      }
    });

    return [...ordered, ...remaining];
  };

  // 2) Stable layers array (ids don't change)
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
        filterRange: [10000, 1000000],
        getFilterCategory: (object: any) => {
          const props = object.properties;
          return [props.feedstock_type, props.status];
        },
        filterCategories: [
          ['Landfill gas', 'Food waste', 'Raw biogas', 'Wastewater', 'Distillery stillage', 'Dairy manure', 'Swine manure', 'Layer manure'],
          ['Engaged', 'Enhanced', 'Contacted', 'Followed up', 'Need to contact']
        ],
        filterEnabled: true
      }),
    ];
  }, []);

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
      <Map
        ref={mapRef}
        onLoad={onLoad}
        initialViewState={{ longitude: -98.5556199, latitude: 39.8097343, zoom: 4 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://api.maptiler.com/maps/hybrid/style.json?key=GYDRZyFt8oPZKclvC77i"
      />

      {/* Dialog for showing point details */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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