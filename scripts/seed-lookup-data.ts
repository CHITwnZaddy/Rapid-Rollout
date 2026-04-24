/**
 * One-time seed script: reads the Excel workbook and inserts lookup data into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-lookup-data.ts --workbook <path> [--dry-run] [--force]
 *
 * Flags:
 *   --workbook <path>   Path to the scoping workbook (.xlsm). Required.
 *   --dry-run           Read and parse the workbook, log row counts, but
 *                       do NOT write anything to Supabase.
 *   --force             Bypass the non-prod URL check. Required when the
 *                       target SUPABASE_URL isn't recognised as local/dev.
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service role key, NOT anon key)
 *
 * Safety: this script uses the service-role key, which bypasses RLS
 * and can overwrite anything. Phase 1.8 added three safeguards:
 *   1. Workbook path must be passed explicitly (no hardcoded absolute
 *      path that only works on one laptop).
 *   2. Dry-run mode prints row counts without touching the DB.
 *   3. The target Supabase URL must look like a local / dev instance,
 *      or the user must pass --force AND type "yes" at a confirmation
 *      prompt that shows the URL and row counts. This prevents the
 *      classic "oh no I just seeded prod" incident.
 */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { sheetToJson } from "../src/lib/exports/sheet-to-json";

// ─── Parse CLI args ─────────────────────────────────────────────────
interface CliArgs {
  workbook: string | null;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { workbook: null, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workbook" || a === "-w") {
      args.workbook = argv[++i] ?? null;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--force") {
      args.force = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npx tsx scripts/seed-lookup-data.ts --workbook <path> [--dry-run] [--force]"
      );
      process.exit(0);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.workbook) {
  console.error(
    "Error: --workbook <path> is required. Run with --help for usage."
  );
  process.exit(1);
}

// ─── Env vars ───────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// ─── Non-prod URL guard ─────────────────────────────────────────────
// Known-safe URLs: anything local, or a hostname that explicitly
// contains "dev" / "staging" / "local". A real Supabase project URL
// looks like https://<ref>.supabase.co — if ours matches that shape
// we treat it as prod-ish and force the user through --force + a
// confirmation prompt.
function isNonProdUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^(dev|staging|local)[-.]/.test(hostname)) return true;
    if (/[-.](dev|staging|local)\./.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

// ─── Main ───────────────────────────────────────────────────────────
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log(`Target Supabase URL: ${supabaseUrl}`);
  console.log(`Workbook: ${args.workbook}`);
  console.log(`Mode: ${args.dryRun ? "DRY RUN (no writes)" : "WRITE"}`);

  console.log("\nReading workbook...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.workbook!);

  // Parse all three sheets up-front so the confirmation prompt can
  // show exact row counts before we commit.
  const rateSheet = wb.getWorksheet("tblRateCard");
  const rateRows = sheetToJson(rateSheet);
  const rateCards = rateRows
    .filter((r) => r["Activity"] || r["RateCardName"])
    .map((r) => ({
      rate_card_name: String(r["RateCardName"] ?? "Master"),
      activity: String(r["Activity"] ?? ""),
      rate: Number(r["Rate"] ?? 0),
      role_category: String(r["RoleCategory"] ?? ""),
      status: String(r["Status"] ?? "Active"),
      lookup_key: `${String(r["RateCardName"] ?? "Master")}|${String(r["Activity"] ?? "")}`,
    }));

  const svcSheet = wb.getWorksheet("tblServiceHours");
  const svcRows = sheetToJson(svcSheet);
  const serviceHours = svcRows
    .filter((r) => r["ServiceName"])
    .map((r) => ({
      service_name: String(r["ServiceName"] ?? ""),
      scope_value: String(r["ScopeValue"] ?? ""),
      ba_hours: Number(r["BA_Hours"] ?? 0),
      pm_hours: Number(r["PM_Hours"] ?? 0),
      sr_im_hours: Number(r["Sr_IM_Hours"] ?? r["BA_Hours"] ?? 0),
      scope_label: String(r["ScopeLabel"] ?? r["ScopeValue"] ?? ""),
      service_group: String(r["ServiceGroup"] ?? ""),
      status: String(r["Status"] ?? "Active"),
      lookup_key: String(
        r["LookupKey"] ?? `${r["ServiceName"]}|${r["ScopeValue"]}`
      ),
    }));

  const custSheet = wb.getWorksheet("CustomerList");
  const custRows = sheetToJson(custSheet);
  const customers = custRows
    .filter((r) => r["Company Name"] || r["CompanyName"])
    .map((r) => ({
      company_name: String(r["Company Name"] ?? r["CompanyName"] ?? ""),
      address_line1: r["Address Line 1"]
        ? String(r["Address Line 1"])
        : null,
      address_line2: r["Address Line 2"]
        ? String(r["Address Line 2"])
        : null,
      city: r["City"] ? String(r["City"]) : null,
      state: r["State"] ? String(r["State"]) : null,
      zip:
        r["Zip Code"] ?? r["Zip"]
          ? String(r["Zip Code"] ?? r["Zip"])
          : null,
    }));

  console.log("\nParsed row counts:");
  console.log(`  rate_cards:    ${rateCards.length}`);
  console.log(`  service_hours: ${serviceHours.length}`);
  console.log(`  customers:     ${customers.length}`);

  if (args.dryRun) {
    console.log("\nDry run complete. No data was written.");
    return;
  }

  // ─── Environment safety ──────────────────────────────────────────
  const nonProd = isNonProdUrl(supabaseUrl);
  if (!nonProd) {
    if (!args.force) {
      console.error(
        `\nRefusing to seed: ${supabaseUrl} does not look like a non-prod URL.\n` +
          "If this really is a dev/staging instance, re-run with --force."
      );
      process.exit(1);
    }
    console.warn(
      `\n⚠️  --force is set. Target URL does NOT look non-prod:\n    ${supabaseUrl}`
    );
    const ok = await confirm(
      `Type "yes" to upsert ${rateCards.length} rate_cards, ${serviceHours.length} service_hours and insert ${customers.length} customers: `
    );
    if (!ok) {
      console.error("Aborted by user.");
      process.exit(1);
    }
  }

  // --- Seed Rate Cards ---
  console.log("\nSeeding rate_cards...");
  if (rateCards.length > 0) {
    const { error } = await supabase
      .from("rate_cards")
      .upsert(rateCards, { onConflict: "lookup_key" });
    if (error) console.error("  Error:", error.message);
    else console.log(`  Inserted ${rateCards.length} rate cards`);
  } else {
    console.log("  Sheet 'tblRateCard' not found or empty");
  }

  // --- Seed Service Hours ---
  console.log("\nSeeding service_hours...");
  if (serviceHours.length > 0) {
    for (let i = 0; i < serviceHours.length; i += 50) {
      const batch = serviceHours.slice(i, i + 50);
      const { error } = await supabase
        .from("service_hours")
        .upsert(batch, { onConflict: "lookup_key" });
      if (error) console.error(`  Error at batch ${i}:`, error.message);
    }
    console.log(`  Inserted ${serviceHours.length} service hour entries`);
  } else {
    console.log("  Sheet 'tblServiceHours' not found or empty");
  }

  // --- Seed Customers ---
  console.log("\nSeeding customers...");
  if (customers.length > 0) {
    const { error } = await supabase.from("customers").insert(customers);
    if (error) console.error("  Error:", error.message);
    else console.log(`  Inserted ${customers.length} customers`);
  } else {
    console.log("  Sheet 'CustomerList' not found or empty");
  }

  console.log("\nDone! Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
