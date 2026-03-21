"use client";
import React from "react";
import { Search, X } from "lucide-react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
}

interface Props {
  onSelect: (lng: number, lat: number, zoom: number) => void;
}

export function GeocoderControl({ onSelect }: Props) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<NominatimResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: value,
          format: "json",
          limit: "6",
          addressdetails: "0",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "Accept-Language": "en" } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function handleSelect(result: NominatimResult) {
    const lng = parseFloat(result.lon);
    const lat = parseFloat(result.lat);
    setQuery(result.display_name);
    setOpen(false);
    setResults([]);
    // Use a sensible default zoom based on result type
    const zoom = ["country", "state", "county"].includes(result.type) ? 8 : 14;
    onSelect(lng, lat, zoom);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="absolute top-2 left-2 z-10 w-72">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search places…"
          className="w-full h-8 pl-8 pr-7 text-sm rounded-md border bg-background/95 shadow-sm backdrop-blur-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {loading && (
          <div className="absolute right-2 h-3.5 w-3.5 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="mt-1 rounded-md border bg-background/95 shadow-md backdrop-blur-sm overflow-hidden">
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
            >
              <span className="font-medium">{r.display_name.split(",")[0]}</span>
              <span className="text-xs text-muted-foreground ml-1.5">
                {r.display_name.split(",").slice(1, 3).join(",").trim()}
              </span>
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] text-muted-foreground border-t bg-muted/30">
            © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  );
}
