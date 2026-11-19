-- =============================================================================
-- Migration: 20261118000004_seed_manager_settings_manage.sql
-- Purpose  : Ensure 'manager' role has 'settings:manage' in role_permissions
--            (matching offlineRolePermissions.ts and branch_security_phase1)
--            and reload PostgREST schema cache.
-- =============================================================================

INSERT INTO public.role_permissions (role, permission)
VALUES ('manager', 'settings:manage')
ON CONFLICT (role, permission) DO NOTHING;

NOTIFY pgrst, 'reload schema';
