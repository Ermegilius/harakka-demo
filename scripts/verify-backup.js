/**
 * Verify Supabase Backup Completeness
 * Checks that all backup files exist and contain expected data
 */

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "supabase/backup";
const CLOUD_EXPORT_DIR = path.join(BACKUP_DIR, "cloud-export");
const STORAGE_DIR = path.join(BACKUP_DIR, "storage");

console.log("🔍 Verifying Supabase Backup");
console.log("============================");
console.log("");

let errors = 0;
let warnings = 0;

// Helper functions
function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ ${description}: ${sizeMB} MB`);
    return true;
  } else {
    console.log(`❌ ${description}: NOT FOUND`);
    errors++;
    return false;
  }
}

function checkFileContains(filePath, searchPattern, description) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const matches = (content.match(searchPattern) || []).length;

    if (matches > 0) {
      console.log(`   ✅ Contains ${matches} ${description}`);
      return true;
    } else {
      console.log(`   ⚠️  No ${description} found`);
      warnings++;
      return false;
    }
  } catch (err) {
    console.log(`   ❌ Cannot read file: ${err.message}`);
    errors++;
    return false;
  }
}

function findLatestFile(files, prefix) {
  // Files use format: YYYYMMDDHHMMSS_name.sql
  // Sort by timestamp (first 14 chars) in descending order
  return files
    .filter((f) => f.includes(prefix) && f.endsWith(".sql"))
    .sort((a, b) => {
      const timestampA = a.split("_")[0];
      const timestampB = b.split("_")[0];
      return timestampB.localeCompare(timestampA); // Descending order
    })[0];
}

try {
  // 1. Check cloud-export directory exists
  if (!fs.existsSync(CLOUD_EXPORT_DIR)) {
    console.log(`❌ Cloud export directory not found: ${CLOUD_EXPORT_DIR}`);
    console.log("");
    console.log("Run: npm run backup:all");
    process.exit(1);
  }

  // 2. Find latest backup files
  console.log("📊 Database Backups:");
  console.log("");

  const files = fs.readdirSync(CLOUD_EXPORT_DIR);

  // Find latest schema dump (format: YYYYMMDDHHMMSS_schemas.sql)
  const latestSchemaFile = findLatestFile(files, "_schemas");

  if (latestSchemaFile) {
    const latestSchema = path.join(CLOUD_EXPORT_DIR, latestSchemaFile);
    const timestamp = latestSchemaFile.split("_")[0];
    console.log(`📅 Latest backup timestamp: ${timestamp}`);
    console.log("");

    if (checkFileExists(latestSchema, "Database schemas")) {
      checkFileContains(
        latestSchema,
        /CREATE TABLE|CREATE FUNCTION|CREATE POLICY/g,
        "schema definitions",
      );
    }
  } else {
    console.log(
      "❌ No schema dump found (expected format: YYYYMMDDHHMMSS_schemas.sql)",
    );
    errors++;
  }

  console.log("");

  // Find latest seed dump (format: YYYYMMDDHHMMSS_seed_data.sql)
  const latestSeedFile = findLatestFile(files, "_seed_data");

  if (latestSeedFile) {
    const latestSeed = path.join(CLOUD_EXPORT_DIR, latestSeedFile);
    if (checkFileExists(latestSeed, "Database data (seed)")) {
      checkFileContains(latestSeed, /INSERT INTO/g, "INSERT statements");
    }
  } else {
    console.log(
      "❌ No seed data dump found (expected format: YYYYMMDDHHMMSS_seed_data.sql)",
    );
    errors++;
  }

  console.log("");

  // Find latest storage schema (format: YYYYMMDDHHMMSS_storage_schema.sql)
  const latestStorageSchemaFile = findLatestFile(files, "_storage_schema");

  if (latestStorageSchemaFile) {
    const latestStorageSchema = path.join(
      CLOUD_EXPORT_DIR,
      latestStorageSchemaFile,
    );
    if (checkFileExists(latestStorageSchema, "Storage schema")) {
      checkFileContains(
        latestStorageSchema,
        /storage\.buckets|storage\.objects/g,
        "storage definitions",
      );
    }
  } else {
    console.log(
      "❌ No storage schema dump found (expected format: YYYYMMDDHHMMSS_storage_schema.sql)",
    );
    errors++;
  }

  console.log("");
  console.log("📦 Storage Files:");
  console.log("");

  // 3. Check storage export
  const exportSummaryPath = path.join(STORAGE_DIR, "export-summary.json");

  if (checkFileExists(exportSummaryPath, "Storage export summary")) {
    const summary = JSON.parse(fs.readFileSync(exportSummaryPath, "utf-8"));

    console.log("");
    console.log("   Storage Export Details:");
    console.log(
      `   - Export date: ${new Date(summary.exportDate).toLocaleString()}`,
    );
    console.log(`   - Buckets: ${summary.totalBuckets}`);
    console.log(`   - Total files: ${summary.totalFiles}`);
    console.log(`   - Downloaded: ${summary.totalDownloaded}`);
    console.log(`   - Failed: ${summary.totalFailed}`);
    console.log(`   - Total size: ${summary.totalSizeMB} MB`);

    if (summary.totalFailed > 0) {
      console.log("");
      console.log(`   ⚠️  ${summary.totalFailed} files failed to download`);
      warnings++;
    }

    // Check each bucket
    console.log("");
    console.log("   Buckets:");
    summary.buckets.forEach((bucket) => {
      const status = bucket.downloaded === bucket.fileCount ? "✅" : "⚠️";
      console.log(
        `   ${status} ${bucket.bucket}: ${bucket.downloaded}/${bucket.fileCount} files`,
      );
    });
  } else {
    errors++;
  }

  console.log("");
  console.log("============================");

  // 4. Summary
  if (errors === 0 && warnings === 0) {
    console.log("✅ All backups verified successfully!");
    console.log("");
    console.log("📁 Backup is complete and ready for migration");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Set up self-hosted Supabase with Docker");
    console.log("  2. Restore schemas:");
    console.log(
      `     psql < cloud-export/${latestSchemaFile || "TIMESTAMP_schemas.sql"}`,
    );
    console.log("  3. Restore data:");
    console.log(
      `     psql < cloud-export/${latestSeedFile || "TIMESTAMP_seed_data.sql"}`,
    );
    console.log("  4. Restore storage schema:");
    console.log(
      `     psql < cloud-export/${
        latestStorageSchemaFile || "TIMESTAMP_storage_schema.sql"
      }`,
    );
    console.log("  5. Upload storage files using import script");
    console.log("");
    process.exit(0);
  } else if (errors === 0) {
    console.log(`⚠️  Backup verified with ${warnings} warning(s)`);
    console.log("");
    console.log("Backup is usable but may have minor issues.");
    console.log(
      "Review warnings above and consider re-running failed operations.",
    );
    console.log("");
    process.exit(0);
  } else {
    console.log(
      `❌ Backup verification failed: ${errors} error(s), ${warnings} warning(s)`,
    );
    console.log("");
    console.log("Issues found:");
    console.log("  - Missing backup files");
    console.log("  - Run: npm run backup:all");
    console.log("");
    process.exit(1);
  }
} catch (error) {
  console.error("");
  console.error("❌ Verification failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
