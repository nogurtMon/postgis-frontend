import Link from "next/link";
import Image from "next/image";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";



export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="" className="w-5 h-5 shrink-0" />
            PostGIS Frontend
          </span>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button asChild size="sm">
              <Link href="/map">Launch App</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <Image
          src="/postgres-frontend-logo1.png"
          loading="eager"
          alt="PostGIS Frontend"
          width={256}
          height={256}
          className="mx-auto mb-8 rounded-xl"
        />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The Interface PostGIS Deserves
        </h1>
        <p className="mt-4 text-xl text-foreground/80 max-w-xl mx-auto font-medium">
          Do more, faster with PostGIS. This is an open-source project to build PostGIS the dynamic interface it deserves.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/map">Launch App</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="https://github.com/nogurtMon/postgis-frontend" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
          </Button>
        </div>
      </section>

      {/* Workflows */}
      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-4">Supported workflows</h2>
          <p className="text-center text-muted-foreground text-sm mb-14 max-w-xl mx-auto">Everything you'd reach for a desktop GIS or Python script — available directly in your browser, connected live to your database.</p>
          <div className="grid sm:grid-cols-2 gap-10">
            {[
              {
                step: "01",
                title: "Connect your database",
                body: "Paste a PostgreSQL connection string and your spatial tables appear instantly, grouped by schema. Your DSN stays in the browser — nothing is logged or stored server-side.",
              },
              {
                step: "02",
                title: "Import spatial files",
                body: "Load shapefiles (.shp), GeoJSON, GeoPackage (.gpkg), and more directly into PostGIS — choose target schema, set the SRID, and more.",
              },
              {
                step: "03",
                title: "Scrape feature servers",
                body: "Pull data from ArcGIS Feature Services and other REST endpoints directly into PostGIS. No manual exports, no intermediate files.",
              },
              {
                step: "04",
                title: "Manage tables and data",
                body: "Edit and visualize your data, convert SRIDs, add primary keys, apply a spatial index, insert and delete rows, rename tables, and more.",
              },
              {
                step: "05",
                title: "Visualize and filter",
                body: "Style by color, opacity, and stroke. Scale point size or line width by any numeric column. Classify fills by category. Filter by any attribute — no SQL required.",
              },
              {
                step: "06",
                title: "Share live map views",
                body: "Generate a read-only link to your current map. Stakeholders get a live, styled view of your data — no credentials, no desktop GIS required.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-5">
                <span className="text-2xl font-bold text-muted-foreground/30 tabular-nums shrink-0 leading-tight">{step}</span>
                <div>
                  <h3 className="font-semibold mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Ready to explore your data?</h2>
        <p className="text-muted-foreground mb-8">No account needed. Just a PostGIS connection string.</p>
        <Button asChild size="lg">
          <Link href="/map">Launch App</Link>
        </Button>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>PostGIS Frontend</span>
          <a href="https://github.com/nogurtMon/postgis-frontend" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
