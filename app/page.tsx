import Link from "next/link";
import Image from "next/image";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";


const faqs = [
  {
    q: "Is it safe to enter my database connection string?",
    a: "Your connection string is stored only in your browser's localStorage — it never leaves your device except to reach your own database. When you perform any operation, your browser sends the DSN to the Next.js API route, which opens a connection, executes the query, and immediately discards the DSN. Nothing is logged or persisted server-side. You can verify this by reading the source code.",
  },
  {
    q: "Should I use my admin credentials?",
    a: "It depends on what you need to do. For read-only exploration, a dedicated user with SELECT access is safest. For full workflow use — importing files, editing rows, managing tables — you'll need a user with the appropriate write permissions on the schemas you're working in.",
  },
  {
    q: "Can it modify or delete my data?",
    a: "Yes. This is a full read-write tool. You can insert, edit, and delete rows, create and drop tables, and import data directly into your database. Make sure the PostgreSQL user you connect with has only the permissions you intend to grant.",
  },
  {
    q: "Does this work with cloud databases like Neon, Supabase, or RDS?",
    a: "Yes — any PostgreSQL database with the PostGIS extension enabled works, including Neon, Supabase, AWS RDS, and self-hosted instances. Since this app is deployed on Vercel, your database needs to accept connections from Vercel's outbound IP ranges. Most managed providers let you allowlist IPs in their network settings, or you can set your database to accept all connections and rely on credential security.",
  },
  {
    q: "What PostGIS version do I need?",
    a: "PostGIS 2.4 or later. ST_AsMVT (used for tile generation) has been stable since PostGIS 2.4 and is available in all major managed PostgreSQL providers.",
  },
  {
    q: "Is there a row limit?",
    a: "No hard limit is enforced — tiles are clipped and simplified by PostGIS for the current viewport, so large tables remain usable at low zoom levels. Performance depends on your database hardware and whether your geometry column has a spatial index.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <span className="font-semibold tracking-tight">PostGIS Frontend</span>
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
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Connect your database; manage its tables; import files (.shp, .geojson, .gpkg); scrape feature servers; visualize, filter and edit spatial data; and share live map views—all in the browser.
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
          <p className="text-center text-muted-foreground text-sm mb-14 max-w-xl mx-auto">Everything you'd reach for a desktop GIS or a collection of scripts — available directly in your browser, connected live to your database.</p>
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

      {/* FAQ */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-8">
            {faqs.map(({ q, a }) => (
              <div key={q}>
                <h3 className="font-semibold mb-2">{q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
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
