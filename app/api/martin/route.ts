import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

// Bundled martin binary, falls back to PATH if not found locally
const MARTIN_BIN = path.join(process.cwd(), "martin");

const MARTIN_PORT = 3001;

// Module-level process handle — persists across requests in the same Node.js process
let martinProcess: ChildProcess | null = null;

function killMartin() {
  if (martinProcess) {
    martinProcess.kill();
    martinProcess = null;
  }
  // Also kill any orphaned process on the port (survives hot-reloads)
  try {
    spawn("fuser", ["-k", `${MARTIN_PORT}/tcp`], { stdio: "ignore" });
  } catch {}
}

async function waitForReady(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/catalog`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export async function POST(req: NextRequest) {
  const { action, dsn } = await req.json();

  if (action === "stop") {
    killMartin();
    return NextResponse.json({ status: "stopped" });
  }

  if (action === "start") {
    if (!dsn?.startsWith("postgres"))
      return NextResponse.json({ error: "Bad DSN" }, { status: 400 });

    if (!fs.existsSync(MARTIN_BIN)) {
      return NextResponse.json({ status: "not_available" });
    }

    killMartin();
    // Give the OS a moment to release the port after fuser -k
    await new Promise((r) => setTimeout(r, 500));

    // Strip and re-apply SSL params for Martin.
    // Neon's pooler sends channel_binding=require which Martin's Rust TLS can't handle —
    // always override to disable regardless of what the user's DSN contains.
    const url = new URL(dsn);
    url.searchParams.set("sslmode", "require");
    url.searchParams.set("channel_binding", "disable");
    const martinDsn = url.toString();

    martinProcess = spawn(
      MARTIN_BIN,
      [martinDsn, "--listen-addresses", `127.0.0.1:${MARTIN_PORT}`],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    martinProcess.on("error", (err) => {
      console.error("[martin] Failed to start:", err.message);
      martinProcess = null;
    });

    let exitCode: number | null = null;
    martinProcess.on("exit", (code) => {
      console.log(`[martin] Exited with code ${code}`);
      exitCode = code;
      martinProcess = null;
    });

    if (process.env.NODE_ENV === "development") {
      martinProcess.stdout?.on("data", (d) => process.stdout.write(`[martin] ${d}`));
      martinProcess.stderr?.on("data", (d) => process.stderr.write(`[martin] ${d}`));
    }

    const ready = await waitForReady(MARTIN_PORT);
    if (!ready) {
      killMartin();
      const reason = exitCode !== null
        ? `Martin exited with code ${exitCode} — check your DSN and that the database is reachable.`
        : "Martin did not become ready in time.";
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    return NextResponse.json({ status: "running", port: MARTIN_PORT });
  }

  if (action === "status") {
    return NextResponse.json({ running: martinProcess !== null });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
