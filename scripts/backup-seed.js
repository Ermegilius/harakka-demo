/**
 * Export database data (INSERT statements only)
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

const filename = `${timestamp}_seed_data.sql`;
const outputFile = path.join(BACKUP_DIR, filename);

console.log("💾 Exporting Database Data");
console.log("==========================");
console.log(`📅 Timestamp: ${timestamp}`);
console.log(`📁 Output: ${outputFile}`);
console.log("");

try {
  execSync(`npx supabase db dump --linked --data-only -f "${outputFile}"`, {
    stdio: "inherit",
    shell: true,
  });

  // Verify data was exported
  const content = fs.readFileSync(outputFile, "utf-8");
  const insertCount = (content.match(/INSERT INTO/g) || []).length;
  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log("");
  console.log("✅ Data export complete!");
  console.log(`📄 File: ${filename}`);
  console.log(`📊 Size: ${sizeMB} MB`);
  console.log(`📋 INSERT statements: ${insertCount}`);

  if (insertCount === 0) {
    console.log("");
    console.log("⚠️  WARNING: No data found in export!");
  }

  process.exit(0);
} catch (error) {
  console.error("");
  console.error("❌ Data export failed:", error.message);
  process.exit(1);
}
