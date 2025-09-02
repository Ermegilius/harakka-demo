# Migration Separation Documentation

## Overview

Due to Supabase preview branch restrictions, we've separated auth and storage schema changes from public schema changes into dedicated migration files.

## Separated Files

### Production-Only Migrations (Cannot be applied to preview branches)

1. **`20250825082829_auth_functions_production_only.sql`**
   - Contains all auth schema functions and triggers
   - Must be applied directly to production environment
   - Cannot be applied to preview branches due to auth schema restrictions

2. **`20250825082830_storage_policies_production_only.sql`**
   - Contains storage bucket policies and table operations
   - Must be applied directly to production environment
   - Cannot be applied to preview branches due to storage schema restrictions

### Branch-Safe Migrations (Can be applied to preview branches)

- No public schema changes were found in the original migration
- Future public schema changes should be placed in separate migration files

## Usage Instructions

### For Preview Branches

1. Preview branches will automatically skip production-only migrations
2. Only public schema migrations will be applied to preview branches
3. Use the branch database URL for testing branch-specific changes

### For Production Deployment

1. Apply all migration files including production-only ones
2. Use production database credentials
3. Migrations will be applied in chronological order by timestamp

```bash
# Apply all migrations to production
npm run s:push
```

### Commands

#### For Preview Branch Development

```bash
# Create public-schema-only migrations for preview branches
npm run s:diff:linked:f -- --schema public

# Test with preview branch
supabase db reset --db-url $BRANCH_DB_URL
```

#### For Production Deployment

```bash
# Apply all migrations to production
npm run s:push
```

## Best Practices

1. **Separate Schema Changes**: Keep auth/storage changes separate from public schema changes
2. **Use Descriptive Names**: Include `_production_only` suffix for restricted migrations
3. **Test Branches First**: Always test public schema changes in preview branches before production
4. **Document Dependencies**: Note any dependencies between auth/storage and public schema changes

## Migration Naming Convention

- `YYYYMMDDHHMMSS_description.sql` - Standard migration
- `YYYYMMDDHHMMSS_description_production_only.sql` - Auth/Storage schema changes
- `YYYYMMDDHHMMSS_description_public_only.sql` - Public schema changes safe for preview branches

## Notes

- Auth and storage schemas are managed by Supabase and cannot be modified in preview branches
- This separation ensures preview branches work correctly while maintaining production functionality
- Always backup original migrations before separation
