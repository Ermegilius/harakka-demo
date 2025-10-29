/**
 * Restore Supabase Storage from backup
 * Recreates buckets and uploads all files
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

// Load environment variables from .env.supabase.local for local development
const envPath = path.join(__dirname, "../.env.supabase.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`📄 Loaded environment from: ${envPath}`);
} else {
  console.warn(`⚠️  Environment file not found: ${envPath}`);
  console.warn("   Using environment variables from process.env");
}

// Local Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is not set!");
  console.error("   Make sure .env.supabase.local exists and contains:");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BACKUP_DIR = path.join(__dirname, "../supabase/backup/storage");

// MIME type detection based on file extension
// Matches backend validation in validateImage.util.ts
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    // Images - matching backend ALLOWED_IMAGE_TYPES
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jfif": "image/jpeg", // JFIF is a JPEG variant
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    // Documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".csv": "text/csv",
    // Media
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    // Archives
    ".zip": "application/zip",
    ".json": "application/json",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

async function restoreBucket(bucketName) {
  const bucketPath = path.join(BACKUP_DIR, bucketName);
  const bucketInfoPath = path.join(bucketPath, "bucket-info.json");

  if (!fs.existsSync(bucketInfoPath)) {
    console.log(`⚠️  No bucket-info.json for ${bucketName}, skipping...`);
    return;
  }

  const bucketInfo = JSON.parse(fs.readFileSync(bucketInfoPath, "utf8"));

  console.log(`\n📦 Creating bucket: ${bucketName}`);

  // Create or update bucket
  const { data: existingBucket } = await supabase.storage.getBucket(bucketName);

  if (existingBucket) {
    console.log(`   Bucket ${bucketName} already exists, updating...`);
    await supabase.storage.updateBucket(bucketName, {
      public: bucketInfo.public,
      fileSizeLimit: bucketInfo.file_size_limit,
      allowedMimeTypes: bucketInfo.allowed_mime_types,
    });
  } else {
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: bucketInfo.public,
      fileSizeLimit: bucketInfo.file_size_limit,
      allowedMimeTypes: bucketInfo.allowed_mime_types,
    });

    if (error) {
      console.error(`   ❌ Error creating bucket: ${error.message}`);
      return;
    }
  }

  // Upload files
  const filesPath = path.join(bucketPath, "files");
  if (fs.existsSync(filesPath)) {
    await uploadDirectory(bucketName, filesPath, "");
  }

  console.log(`   ✅ Bucket ${bucketName} restored`);
}

async function uploadDirectory(bucketName, dirPath, prefix) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (item === ".emptyFolderPlaceholder") continue;

    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      // Recursively upload subdirectories
      await uploadDirectory(bucketName, itemPath, `${prefix}${item}/`);
    } else {
      // Upload file
      const filePath = `${prefix}${item}`;
      const fileBuffer = fs.readFileSync(itemPath);
      const contentType = getMimeType(item);

      console.log(`   📤 Uploading: ${filePath} (${contentType})`);

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBuffer, {
          contentType: contentType,
          upsert: true,
        });

      if (error) {
        console.error(`      ❌ Error uploading ${filePath}: ${error.message}`);
      }
    }
  }
}

async function restoreAllStorage() {
  console.log("🔄 Starting storage restoration...\n");

  const buckets = fs.readdirSync(BACKUP_DIR).filter((item) => {
    const itemPath = path.join(BACKUP_DIR, item);
    return (
      fs.statSync(itemPath).isDirectory() &&
      fs.existsSync(path.join(itemPath, "bucket-info.json"))
    );
  });

  console.log(`Found ${buckets.length} buckets to restore:`);
  buckets.forEach((b) => console.log(`  - ${b}`));

  for (const bucket of buckets) {
    await restoreBucket(bucket);
  }

  console.log("\n✅ Storage restoration complete!");
}

restoreAllStorage().catch(console.error);
