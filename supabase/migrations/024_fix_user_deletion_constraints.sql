-- ============================================================================
-- FIX USER DELETION CONSTRAINTS
-- Allow users to be deleted by setting added_by to NULL in do_not_contact
-- ============================================================================

-- Drop the existing foreign key constraint
ALTER TABLE do_not_contact
DROP CONSTRAINT IF EXISTS do_not_contact_added_by_fkey;

-- Re-add with ON DELETE SET NULL so user can be deleted
ALTER TABLE do_not_contact
ADD CONSTRAINT do_not_contact_added_by_fkey
FOREIGN KEY (added_by)
REFERENCES users(id)
ON DELETE SET NULL;

-- Add RLS policy to allow users to delete themselves
DROP POLICY IF EXISTS "Users can delete own profile" ON users;
CREATE POLICY "Users can delete own profile" ON users
  FOR DELETE USING (auth.uid() = id);

-- ============================================================================
-- NOTES
-- ============================================================================
-- This migration allows users to be deleted from the users table
-- When a user is deleted:
-- 1. Their user_tenants entries are CASCADE deleted (already configured)
-- 2. Their do_not_contact.added_by references are SET NULL (fixed here)
-- 3. The users table entry is CASCADE deleted when auth.users is deleted
