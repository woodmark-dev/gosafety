import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/server/db";

const REQUIRED_SITES: Array<{ id: string; site_code: string; site_name: string }> = [
  { id: "manual-nnpc-towers", site_code: "NNPC_TOWERS", site_name: "NNPC Towers" },
  { id: "manual-rti-nexus", site_code: "RTI_NEXUS", site_name: "RTI Nexus" },
  { id: "manual-krpc", site_code: "KRPC", site_name: "KRPC" },
];

export async function GET() {
  try {
    const [categories, severities, sites] = await Promise.all([
      dbQuery<{ id: string; code: string; name: string }>(
        `
        SELECT id, code, name
        FROM incident_categories
        WHERE is_active = true AND deleted_at IS NULL
        ORDER BY name ASC
        `
      ),
      dbQuery<{ id: string; code: string; name: string }>(
        `
        SELECT id, code, name
        FROM severity_levels
        WHERE is_active = true
        ORDER BY rank ASC
        `
      ),
      dbQuery<{ id: string; site_code: string; site_name: string }>(
        `
        SELECT id, site_code, site_name
        FROM sites
        WHERE deleted_at IS NULL
        ORDER BY site_name ASC
        `
      ),
    ]);

    const existingNames = new Set(sites.rows.map((site) => site.site_name.trim().toLowerCase()));
    const mergedSites = [
      ...sites.rows,
      ...REQUIRED_SITES.filter((site) => !existingNames.has(site.site_name.trim().toLowerCase())),
    ].sort((a, b) => a.site_name.localeCompare(b.site_name));

    return NextResponse.json({
      categories: categories.rows,
      severities: severities.rows,
      sites: mergedSites,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to load lookups",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
