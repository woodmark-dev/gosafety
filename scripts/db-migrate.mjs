import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const migrationsDir = path.join(__dirname, "..", "db", "migrations");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function run() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (migrationFiles.length === 0) {
    console.log("No migration files found.");
    return;
  }

  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id bigserial PRIMARY KEY,
        file_name text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const fileName of migrationFiles) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE file_name = $1",
        [fileName]
      );

      if (alreadyApplied.rowCount > 0) {
        console.log(`Skipping migration ${fileName} (already applied)`);
        continue;
      }

      const fullPath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(fullPath, "utf8");
      console.log(`Applying migration ${fileName}...`);
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(file_name) VALUES ($1)", [fileName]);
      await client.query("COMMIT");
      console.log(`Applied migration ${fileName}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
