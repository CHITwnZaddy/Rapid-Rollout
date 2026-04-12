/**
 * One-time seed script: reads the Excel workbook and inserts lookup data into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-lookup-data.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (use service role key for seeding, not anon key)
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const WORKBOOK_PATH =
  "/Users/austin_alexander_guzman/Library/CloudStorage/GoogleDrive-austinguzman@cmpstl.com/Shared drives/Trimble Partnership/00.  Master Documents/Master Rate Sheets/TUC Rapid Rollout Scoping Workbook v1.xlsm";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Reading workbook...");
  const wb = XLSX.readFile(WORKBOOK_PATH);

  // --- Seed Rate Cards ---
  console.log("\nSeeding rate_cards...");
  const rateSheet = wb.Sheets["tblRateCard"];
  if (rateSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(rateSheet);
    const rateCards = rows
      .filter((r) => r["Activity"] || r["RateCardName"])
      .map((r) => ({
        rate_card_name: String(r["RateCardName"] ?? "Master"),
        activity: String(r["Activity"] ?? ""),
        rate: Number(r["Rate"] ?? 0),
        role_category: String(r["RoleCategory"] ?? ""),
        status: String(r["Status"] ?? "Active"),
        lookup_key: String(
          r["LookupKey"] ?? `${r["RateCardName"]}|${r["Activity"]}`
        ),
      }));

    const { error } = await supabase.from("rate_cards").upsert(rateCards, {
      onConflict: "lookup_key",
    });
    if (error) console.error("  Error:", error.message);
    else console.log(`  Inserted ${rateCards.length} rate cards`);
  } else {
    console.log("  Sheet 'tblRateCard' not found");
  }

  // --- Seed Service Hours ---
  console.log("\nSeeding service_hours...");
  const svcSheet = wb.Sheets["tblServiceHours"];
  if (svcSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(svcSheet);
    const serviceHours = rows
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

    // Batch insert in chunks of 50
    for (let i = 0; i < serviceHours.length; i += 50) {
      const batch = serviceHours.slice(i, i + 50);
      const { error } = await supabase.from("service_hours").upsert(batch, {
        onConflict: "lookup_key",
      });
      if (error) console.error(`  Error at batch ${i}:`, error.message);
    }
    console.log(`  Inserted ${serviceHours.length} service hour entries`);
  } else {
    console.log("  Sheet 'tblServiceHours' not found");
  }

  // --- Seed Customers ---
  console.log("\nSeeding customers...");
  const custSheet = wb.Sheets["CustomerList"];
  if (custSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(custSheet);
    const customers = rows
      .filter((r) => r["Company Name"] || r["CompanyName"])
      .map((r) => ({
        company_name: String(
          r["Company Name"] ?? r["CompanyName"] ?? ""
        ),
        address_line1: r["Address Line 1"]
          ? String(r["Address Line 1"])
          : null,
        address_line2: r["Address Line 2"]
          ? String(r["Address Line 2"])
          : null,
        city: r["City"] ? String(r["City"]) : null,
        state: r["State"] ? String(r["State"]) : null,
        zip: r["Zip Code"] ?? r["Zip"] ? String(r["Zip Code"] ?? r["Zip"]) : null,
      }));

    const { error } = await supabase.from("customers").insert(customers);
    if (error) console.error("  Error:", error.message);
    else console.log(`  Inserted ${customers.length} customers`);
  } else {
    console.log("  Sheet 'CustomerList' not found");
  }

  console.log("\nDone! Seed complete.");
}

main().catch(console.error);
