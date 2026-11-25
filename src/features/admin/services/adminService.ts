import { adminCompaniesAndPlansService } from './modules/adminCompaniesAndPlans';
import { adminSecurityAndSystemService } from './modules/adminSecurityAndSystem';

export const adminService = {
  // System metrics, telemetry & configuration
  getMetrics: adminSecurityAndSystemService.getMetrics,
  getServiceTelemetry: adminSecurityAndSystemService.getServiceTelemetry,
  pingDatabase: adminSecurityAndSystemService.pingDatabase,
  getMaintenanceConfig: adminSecurityAndSystemService.getMaintenanceConfig,
  getSystemConfigs: adminSecurityAndSystemService.getSystemConfigs,
  updateSystemConfig: adminSecurityAndSystemService.updateSystemConfig,

  // Companies, subscription plans & platform users
  getCompanies: adminCompaniesAndPlansService.getCompanies,
  getCompaniesCount: adminCompaniesAndPlansService.getCompaniesCount,
  toggleCompanyStatus: adminCompaniesAndPlansService.toggleCompanyStatus,
  extendTrial: adminCompaniesAndPlansService.extendTrial,
  assignCompanyPlan: adminCompaniesAndPlansService.assignCompanyPlan,
  getSubscriptionPlans: adminCompaniesAndPlansService.getSubscriptionPlans,
  saveSubscriptionPlan: adminCompaniesAndPlansService.saveSubscriptionPlan,
  deleteSubscriptionPlan: adminCompaniesAndPlansService.deleteSubscriptionPlan,
  getUsers: adminCompaniesAndPlansService.getUsers,
  getUsersCount: adminCompaniesAndPlansService.getUsersCount,
  toggleSuperAdmin: adminCompaniesAndPlansService.toggleSuperAdmin,

  // Security alerts & CSP reports
  resolveSecurityAlert: adminSecurityAndSystemService.resolveSecurityAlert,
  getSecurityAlerts: adminSecurityAndSystemService.getSecurityAlerts,
  getSecurityAlertsCount: adminSecurityAndSystemService.getSecurityAlertsCount,
  getCspReportsPage: adminSecurityAndSystemService.getCspReportsPage,
  getCspReportsCount: adminSecurityAndSystemService.getCspReportsCount,

  /** حجم الشريحة لتصدير قوائم المنشآت/المستخدمين (لا يوجد حد خادمي صريح). */
  EXPORT_LIST_CHUNK: 500,

  /** الحد الأقصى لكل استدعاء في get_security_alerts_page/get_csp_reports_page (200 خادمياً). */
  EXPORT_SECURITY_CHUNK: 200,

  exportAllCompanies(params?: { search?: string | undefined; status?: string | undefined }) {
    return adminCompaniesAndPlansService.exportAllCompanies(this.EXPORT_LIST_CHUNK, params);
  },

  exportAllUsers(search?: string) {
    return adminCompaniesAndPlansService.exportAllUsers(this.EXPORT_LIST_CHUNK, search);
  },

  exportAllSecurityAlerts(resolved?: boolean) {
    return adminSecurityAndSystemService.exportAllSecurityAlerts(
      this.EXPORT_SECURITY_CHUNK,
      resolved
    );
  },

  exportAllCspReports() {
    return adminSecurityAndSystemService.exportAllCspReports(this.EXPORT_SECURITY_CHUNK);
  },
};
