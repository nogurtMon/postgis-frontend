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
          The Visual Interface for PostGIS
        </h1>
        <p className="mt-4 text-xl text-foreground/80 max-w-xl mx-auto font-medium">
          Connect your PostGIS database and instantly visualize, style, filter, and share your spatial data — open source, self-hosted, no account required.
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
          <h2 className="text-2xl font-bold tracking-tight text-center mb-4">Built for spatial data teams</h2>
          <p className="text-center text-muted-foreground text-sm mb-14 max-w-xl mx-auto">Everything you'd reach for QGIS or a Python script — available in your browser, connected live to your PostGIS database.</p>
          <div className="grid sm:grid-cols-2 gap-10">
            {[
              {
                step: "01",
                title: "Connect your database",
                body: "Paste a PostgreSQL connection string and your spatial tables appear instantly, grouped by schema. Your credentials stay in the browser — never logged, never stored server-side.",
              },
              {
                step: "02",
                title: "Import spatial data",
                body: "Load GeoPackage (.gpkg), GeoJSON, shapefiles, and KML directly into PostGIS. Choose the target schema, review column mappings, and import — no intermediate steps.",
              },
              {
                step: "03",
                title: "Ingest from ArcGIS",
                body: "Pull any ArcGIS Feature Service directly into PostGIS. Paginated requests, automatic type mapping, and schema control — no manual exports or intermediate files.",
              },
              {
                step: "04",
                title: "Manage tables and rows",
                body: "Rename tables, add primary keys, create spatial indexes, cast geometry types, reassign SRIDs, and edit rows — all without writing SQL.",
              },
              {
                step: "05",
                title: "Style, classify, and filter",
                body: "Style by color, opacity, and stroke. Scale point size or line width by any numeric column. Classify fills by category. Filter by any attribute — live, with no SQL required.",
              },
              {
                step: "06",
                title: "Share live map views",
                body: "Save named views and share them as public read-only links. Stakeholders see your live, styled data in the browser — no credentials, no desktop GIS, no account.",
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
        <h2 className="text-2xl font-bold tracking-tight mb-4">Self-hosted means your data stays yours.</h2>
        <p className="text-muted-foreground mb-8">One connection string. No account, no cloud middleman, no lock-in.</p>
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
