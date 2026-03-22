import Link from "next/link";
import Image from "next/image";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Browse your spatial tables",
    description: "Every geometry and geography column in your database is discovered automatically and grouped by schema. One click adds it to the map.",
  },
  {
    title: "Style by geometry type",
    description: "Points, lines, and polygons each get relevant controls. Scale point radius by any numeric column for instant choropleth-style visualization.",
  },
  {
    title: "Filter without writing SQL",
    description: "Apply column filters directly from the layer panel using standard operators — equals, greater than, LIKE, IS NULL, and more.",
  },
  {
    title: "No infrastructure required",
    description: "Tiles are generated on-demand from your database using PostGIS's native ST_AsMVT. No tile server, no cache, no extra services to run.",
  },
  {
    title: "Multiple basemaps",
    description: "Switch between Liberty, Bright, Positron, and satellite imagery. All free, no API keys required.",
  },
  {
    title: "Inspect any feature",
    description: "Click a feature on the map to view all of its properties in a clean panel.",
  },
];

const faqs = [
  {
    q: "Is it safe to enter my database connection string?",
    a: "Your connection string is stored only in your browser's localStorage — it never leaves your device except to reach your own database. When you load a layer, your browser sends the DSN to the Next.js API route, which opens a connection to your database, fetches the tile, and immediately discards the DSN. Nothing is logged or persisted server-side. You can verify this by reading the source code.",
  },
  {
    q: "Should I use my admin credentials?",
    a: "No. We recommend creating a dedicated read-only PostgreSQL user with access only to the schemas you want to explore. This limits exposure even in the unlikely event something goes wrong.",
  },
  {
    q: "Does this work with cloud databases like Neon, Supabase, or RDS?",
    a: "Yes — any PostgreSQL database with the PostGIS extension enabled works. Just make sure your database accepts connections from Vercel's IP ranges (or wherever you're hosting the app).",
  },
  {
    q: "What PostGIS version do I need?",
    a: "PostGIS 2.4 or later. ST_AsMVT (used for tile generation) has been stable since PostGIS 2.4 and is available in all major managed PostgreSQL providers.",
  },
  {
    q: "Is there a row limit?",
    a: "No hard limit is enforced — tiles are clipped and simplified by PostGIS for the current viewport, so large tables remain usable at low zoom levels. Performance depends on your database hardware and whether your geometry column is indexed.",
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
            Query, visualize, and explore your spatial data — without leaving your database workflow. Open source, purpose-built for the world's most powerful GIS database.
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

      {/* Audience */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-10">Built for energy industry professionals</p>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              {
                title: "Analysts",
                body: "Quickly explore and QA spatial datasets — substations, pipelines, sites, and assets — without writing a line of SQL.",
              },
              {
                title: "Business Developers",
                body: "Visualize opportunity maps, service territories, and project footprints to support siting decisions and partnership conversations.",
              },
              {
                title: "Project Developers",
                body: "Track project portfolios on a live map, filter by status or region, and manage point data directly from the browser.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="flex flex-col items-center">
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-bold tracking-tight text-center mb-12">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-8 text-center">
          {[
            { step: "1", title: "Connect", body: "Paste your PostgreSQL connection string. It stays in your browser — nothing is stored on any server." },
            { step: "2", title: "Browse", body: "Your spatial tables are discovered automatically. Click any table to add it to the map as a layer." },
            { step: "3", title: "Explore", body: "Style layers, apply filters, scale points by data values, and click features to inspect their properties." },
          ].map(({ step, title, body }) => (
            <div key={step} className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm mb-4">
                {step}
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-12">Everything you need to explore spatial data</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title}>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
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
