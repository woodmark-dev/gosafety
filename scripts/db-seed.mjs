import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const seedDir = path.join(__dirname, "..", "db", "seeds");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function run() {
  const entries = await fs.readdir(seedDir, { withFileTypes: true });
  const seedFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (seedFiles.length === 0) {
    console.log("No seed files found.");
    return;
  }

  await client.connect();

  try {
    for (const fileName of seedFiles) {
      const fullPath = path.join(seedDir, fileName);
      const sql = await fs.readFile(fullPath, "utf8");
      console.log(`Running seed ${fileName}...`);
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`Completed seed ${fileName}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
