import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '../../auth/store';
import { canUserSwitchBranches, useBranchFilterStore } from '../store';
import { useBranchFilter } from './useBranchFilter';

const COMPANY_ID = '7f3a9c21-5b4e-4d8a-9e12-6c0d3b8a5f47';
const BRANCH_WAEL = 'd8771318-20f8-4260-9ac6-e40c3378a5e1';
const BRANCH_GHAMDAN = '9c2e5d71-3a8f-4b6c-8d24-1e7f0a9b6c58';

const baseUser = {
  id: 'u-1',
  email: 'test@example.com',
  full_name: 'مستخدم تجريبي',
  company_id: COMPANY_ID,
  is_active: true,
};

describe('Strict Branch Isolation — canUserSwitchBranches & useBranchFilter', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    useBranchFilterStore.setState({
      activeBranchId: null,
      activeBranchName: null,
      activeWarehouseId: null,
      activeWarehouseName: null,
      activeCompanyId: COMPANY_ID,
      allBranchesSelected: false,
    });
  });

  describe('canUserSwitchBranches', () => {
    it('allows owner and admin even when assigned a default branch_id', () => {
      expect(canUserSwitchBranches({ role: 'owner', branch_id: BRANCH_WAEL })).toBe(true);
      expect(canUserSwitchBranches({ role: 'admin', branch_id: BRANCH_WAEL })).toBe(true);
    });

    it('allows unassigned company-wide manager (branch_id === null)', () => {
      expect(canUserSwitchBranches({ role: 'manager', branch_id: null })).toBe(true);
    });

    it('denies branch-scoped manager (role === manager with branch_id)', () => {
      expect(canUserSwitchBranches({ role: 'manager', branch_id: BRANCH_GHAMDAN })).toBe(false);
    });

    it('denies cashier, accountant, sales, and null user', () => {
      expect(canUserSwitchBranches({ role: 'cashier', branch_id: BRANCH_GHAMDAN })).toBe(false);
      expect(canUserSwitchBranches({ role: 'accountant', branch_id: BRANCH_GHAMDAN })).toBe(false);
      expect(canUserSwitchBranches({ role: 'sales', branch_id: null })).toBe(false);
      expect(canUserSwitchBranches(null)).toBe(false);
    });
  });

  describe('useBranchFilter', () => {
    it('lets owner switch between branches and select all branches', () => {
      useAuthStore.setState({
        user: {
          ...baseUser,
          role: 'owner',
          branch_id: BRANCH_WAEL,
          branch_name: 'فرع وائل النظاري',
        } as never,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useBranchFilter());

      expect(result.current.canSwitchBranches).toBe(true);
      expect(result.current.isManager).toBe(true);
      expect(result.current.isBranchLocked).toBe(false);
      expect(result.current.branchId).toBe(BRANCH_WAEL);

      act(() => {
        useBranchFilterStore.getState().setActiveBranch(BRANCH_GHAMDAN, 'فرع غمدان النظاري', COMPANY_ID);
      });
      expect(result.current.branchId).toBe(BRANCH_GHAMDAN);
      expect(result.current.showingAll).toBe(false);

      act(() => {
        useBranchFilterStore.getState().resetToAll();
      });
      expect(result.current.branchId).toBeNull();
      expect(result.current.showingAll).toBe(true);
    });

    it('strictly locks branch-scoped manager to own branch even with stale store state', () => {
      // Simulate stale store pointing to another branch + warehouse
      useBranchFilterStore.setState({
        activeBranchId: BRANCH_WAEL,
        activeBranchName: 'فرع وائل النظاري',
        activeWarehouseId: 'wh-wael',
        activeWarehouseName: 'مستودع وائل',
        activeCompanyId: COMPANY_ID,
        allBranchesSelected: false,
      });

      useAuthStore.setState({
        user: {
          ...baseUser,
          role: 'manager',
          branch_id: BRANCH_GHAMDAN,
          branch_name: 'فرع غمدان النظاري',
        } as never,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useBranchFilter());

      expect(result.current.canSwitchBranches).toBe(false);
      expect(result.current.isManager).toBe(false);
      expect(result.current.isBranchLocked).toBe(true);
      expect(result.current.branchId).toBe(BRANCH_GHAMDAN);
      expect(result.current.branchName).toBe('فرع غمدان النظاري');
      expect(result.current.warehouseId).toBeNull();
      expect(result.current.showingAll).toBe(false);

      // Even if allBranchesSelected becomes true in store, branch manager stays locked
      act(() => {
        useBranchFilterStore.getState().resetToAll();
      });
      expect(result.current.branchId).toBe(BRANCH_GHAMDAN);
      expect(result.current.showingAll).toBe(false);
    });

    it('strictly locks cashier to assigned branch', () => {
      useAuthStore.setState({
        user: {
          ...baseUser,
          role: 'cashier',
          branch_id: BRANCH_GHAMDAN,
          branch_name: 'فرع غمدان النظاري',
        } as never,
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useBranchFilter());

      expect(result.current.canSwitchBranches).toBe(false);
      expect(result.current.isBranchLocked).toBe(true);
      expect(result.current.branchId).toBe(BRANCH_GHAMDAN);
      expect(result.current.showingAll).toBe(false);
    });
  });
});
