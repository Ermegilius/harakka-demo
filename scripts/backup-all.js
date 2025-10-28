/**
 * Complete Supabase Backup Script
 * Dumps schemas + data + storage schema + storage files
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

console.log("🚀 Complete Supabase Backup");
console.log("===========================");
console.log(`📅 Timestamp: ${timestamp}`);
console.log("");

const steps = [
  {
    name: "Database schemas",
    file: `${timestamp}_schemas.sql`,
    command: `npx supabase db dump --linked -f "supabase/backup/cloud-export/${timestamp}_schemas.sql"`,
    verifyData: false,
  },
  {
    name: "Database data (seed)",
    file: `${timestamp}_seed_data.sql`,
    command: `npx supabase db dump --linked --data-only -f "supabase/backup/cloud-export/${timestamp}_seed_data.sql"`,
    verifyData: true,
  },
  {
    name: "Storage schema",
    file: `${timestamp}_storage_schema.sql`,
    command: `npx supabase db dump --linked --schema storage -f "supabase/backup/cloud-export/${timestamp}_storage_schema.sql"`,
    verifyData: false,
  },
];

try {
  // Step 1-3: Database dumps
  steps.forEach((step, index) => {
    console.log(`📊 Step ${index + 1}/4: Exporting ${step.name}...`);

    execSync(step.command, {
      stdio: "inherit",
      shell: true,
    });

    const filePath = path.join(BACKUP_DIR, step.file);
    const content = fs.readFileSync(filePath, "utf-8");
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`   ✅ Saved: ${step.file} (${sizeMB} MB)`);

    // Verify data if needed
    if (step.verifyData) {
      const insertCount = (content.match(/INSERT INTO/g) || []).length;
      console.log(`   📋 INSERT statements: ${insertCount}`);

      if (insertCount === 0) {
        console.log("   ⚠️  WARNING: No data found!");
      }
    }

    console.log("");
  });

  // Step 4: Storage files
  console.log("💾 Step 4/4: Exporting storage files...");
  execSync("node scripts/export-storage.js", {
    stdio: "inherit",
    shell: true,
  });

  console.log("");
  console.log("===========================");
  console.log("✅ Backup Complete!");
  console.log("");
  console.log("📁 Backup location: supabase/backup/");
  console.log("");
  console.log("📊 Created files:");

  steps.forEach((step) => {
    const filePath = path.join(BACKUP_DIR, step.file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   - ${step.file} (${sizeMB} MB)`);
  });

  console.log(`   - storage/ (see export-summary.json for details)`);
  console.log("");
  console.log("🎉 All backups completed successfully!");

  process.exit(0);
} catch (error) {
  console.error("");
  console.error("❌ Backup failed:", error.message);
  process.exit(1);
}
