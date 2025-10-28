/**
 * Supabase Storage Backup Script
 * Exports ALL storage buckets and their files
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({ path: ".env.production" });

const SUPABASE_URL = `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_DIR = "./supabase/backup/storage";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Get list of all buckets
async function listBuckets() {
  const { data, error } = await supabase.storage.listBuckets();

  if (error) {
    console.error("Error listing buckets:", error);
    throw error;
  }

  return data;
}

// List all files in a bucket recursively
async function listAllFiles(bucketName, prefix = "") {
  const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.error(`Error listing files in "${bucketName}/${prefix}":`, error);
    throw error;
  }

  let files = [];

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

    // Check if it's a folder (folders have id === null)
    if (item.id === null) {
      console.log(`    📁 Scanning: ${fullPath}`);
      const subFiles = await listAllFiles(bucketName, fullPath);
      files.push(...subFiles);
    } else {
      // It's a file
      files.push(fullPath);
    }
  }

  return files;
}

// Download a single file
async function downloadFile(bucketName, filePath, bucketOutDir) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) throw error;

    const outPath = path.join(bucketOutDir, "files", filePath);
    await ensureDir(path.dirname(outPath));

    const fileBuffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(outPath, fileBuffer);

    const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    return { success: true, size: fileBuffer.length, sizeMB };
  } catch (err) {
    console.error(`    ✗ Failed: ${filePath} - ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Export a single bucket
async function exportBucket(bucket) {
  console.log(`\n📦 Exporting bucket: ${bucket.name}`);
  console.log(`   Public: ${bucket.public ? "Yes" : "No"}`);
  console.log(`   ID: ${bucket.id}`);

  const bucketOutDir = path.join(OUT_DIR, bucket.name);
  await ensureDir(bucketOutDir);

  try {
    // List all files
    console.log("   📋 Listing files...");
    const allFiles = await listAllFiles(bucket.name);

    if (allFiles.length === 0) {
      console.log("   ⚠️  No files found in bucket");

      // Save bucket metadata even if empty
      fs.writeFileSync(
        path.join(bucketOutDir, "bucket-info.json"),
        JSON.stringify(bucket, null, 2),
      );

      return {
        bucket: bucket.name,
        fileCount: 0,
        downloaded: 0,
        failed: 0,
        totalSize: 0,
      };
    }

    console.log(`   ✅ Found ${allFiles.length} files`);
    console.log("   💾 Downloading...");

    // Download all files
    let downloaded = 0;
    let failed = 0;
    let totalSize = 0;

    for (const file of allFiles) {
      const result = await downloadFile(bucket.name, file, bucketOutDir);

      if (result.success) {
        downloaded++;
        totalSize += result.size;
        console.log(
          `      ✓ [${downloaded}/${allFiles.length}] ${file} (${result.sizeMB} MB)`,
        );
      } else {
        failed++;
      }
    }

    // Save bucket metadata
    const metadata = {
      ...bucket,
      exportDate: new Date().toISOString(),
      totalFiles: allFiles.length,
      downloadedFiles: downloaded,
      failedFiles: failed,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      files: allFiles,
    };

    fs.writeFileSync(
      path.join(bucketOutDir, "bucket-info.json"),
      JSON.stringify(metadata, null, 2),
    );

    console.log(`   ✅ Downloaded ${downloaded}/${allFiles.length} files`);
    console.log(
      `   📊 Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
    );

    return {
      bucket: bucket.name,
      fileCount: allFiles.length,
      downloaded,
      failed,
      totalSize,
    };
  } catch (err) {
    console.error(`   ❌ Failed to export bucket: ${err.message}`);
    return {
      bucket: bucket.name,
      fileCount: 0,
      downloaded: 0,
      failed: 0,
      totalSize: 0,
      error: err.message,
    };
  }
}

// Main export function
(async () => {
  try {
    console.log("🚀 Starting Complete Storage Export");
    console.log("===================================");
    console.log(`📁 Output directory: ${OUT_DIR}`);
    console.log("");

    await ensureDir(OUT_DIR);

    // Get all buckets
    console.log("📋 Fetching list of storage buckets...");
    const buckets = await listBuckets();

    console.log(`✅ Found ${buckets.length} storage buckets:`);
    buckets.forEach((b) => {
      console.log(`   - ${b.name} (${b.public ? "public" : "private"})`);
    });

    // Export each bucket
    const results = [];
    for (const bucket of buckets) {
      const result = await exportBucket(bucket);
      results.push(result);
    }

    // Summary
    console.log("");
    console.log("===================================");
    console.log("✅ Storage Export Complete");
    console.log("");
    console.log("📊 Summary by Bucket:");
    console.log("");

    let totalFiles = 0;
    let totalDownloaded = 0;
    let totalFailed = 0;
    let totalSizeBytes = 0;

    results.forEach((r) => {
      totalFiles += r.fileCount;
      totalDownloaded += r.downloaded;
      totalFailed += r.failed;
      totalSizeBytes += r.totalSize;

      console.log(`📦 ${r.bucket}:`);
      console.log(`   Files: ${r.fileCount}`);
      console.log(`   Downloaded: ${r.downloaded}`);
      if (r.failed > 0) {
        console.log(`   Failed: ${r.failed}`);
      }
      if (r.totalSize > 0) {
        console.log(`   Size: ${(r.totalSize / (1024 * 1024)).toFixed(2)} MB`);
      }
      console.log("");
    });

    console.log("📊 Total Across All Buckets:");
    console.log(`   Buckets: ${buckets.length}`);
    console.log(`   Total files: ${totalFiles}`);
    console.log(`   Downloaded: ${totalDownloaded}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(
      `   Total size: ${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
    );
    console.log("");

    // Save overall summary
    const summary = {
      exportDate: new Date().toISOString(),
      projectId: process.env.SUPABASE_PROJECT_ID,
      projectUrl: SUPABASE_URL,
      totalBuckets: buckets.length,
      totalFiles,
      totalDownloaded,
      totalFailed,
      totalSizeBytes,
      totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
      buckets: results,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, "export-summary.json"),
      JSON.stringify(summary, null, 2),
    );

    console.log(`📄 Summary saved to: ${OUT_DIR}/export-summary.json`);
    console.log("");
    console.log("🎉 All storage buckets exported successfully!");
  } catch (err) {
    console.error("");
    console.error("❌ Export failed:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
