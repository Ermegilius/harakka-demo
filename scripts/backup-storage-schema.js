/**
 * Export storage schema (buckets, RLS policies)
 * Cross-platform Node.js script
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Generate timestamp like migration files: YYYYMMDDHHMMSS
const now = new Date();
const timestamp = now
  .toISOString()
  .replace(/[-:T.]/g, "")
  .slice(0, 14);

const BACKUP_DIR = "supabase/backup/cloud-export";

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const filename = `${timestamp}_storage_schema.sql`;
const outputFile = path.join(BACKUP_DIR, filename);

console.log("📦 Exporting Storage Schema");
console.log("============================");
console.log(`📅 Timestamp: ${timestamp}`);
console.log(`📁 Output: ${outputFile}`);
console.log("");

try {
  execSync(
    `npx supabase db dump --linked --schema storage -f "${outputFile}"`,
    {
      stdio: "inherit",
      shell: true,
    },
  );

  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log("");
  console.log("✅ Storage schema export complete!");
  console.log(`📄 File: ${filename}`);
  console.log(`📊 Size: ${sizeMB} MB`);

  process.exit(0);
} catch (error) {
  console.error("");
  console.error("❌ Storage schema export failed:", error.message);
  process.exit(1);
}
