import { isCogsAccount, isTreasuryAccount } from './reports/accountClassifiers';
import { getLedger } from './reports/ledgerReportService';
import {
  getMonthlyPerformance,
  getTrialBalance,
  getVatReturnReport,
} from './reports/trialBalanceService';
import { getFinancials } from './reports/financialStatementsService';

export { isCogsAccount, isTreasuryAccount };

export const reportService = {
  getLedger,
  getTrialBalance,
  getFinancials,
  getMonthlyPerformance,
  getVatReturnReport,
};
