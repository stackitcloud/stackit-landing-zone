ALTER TABLE lzc.stackit_organization_access
  DROP CONSTRAINT stackit_organization_access_permissions_check,
  ADD CONSTRAINT stackit_organization_access_permissions_check
    CHECK (cardinality(permissions) <= 4096 AND array_position(permissions, NULL) IS NULL),
  DROP CONSTRAINT stackit_organization_access_owner_permissions_check,
  ADD CONSTRAINT stackit_organization_access_owner_permissions_check
    CHECK (cardinality(owner_permissions) BETWEEN 1 AND 4096 AND array_position(owner_permissions, NULL) IS NULL);