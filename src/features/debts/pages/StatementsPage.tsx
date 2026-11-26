import type React from 'react';
import StatementView from '../../parties/components/StatementView';

/**
 * Unified Statements page — fixed full-viewport Excel workspace where filters stay
 * pinned at the very top and only the statement sheet scrolls.
 */
const StatementsPage: React.FC = () => (
  <div className="flex h-[calc(100dvh-56px)] w-full flex-col overflow-hidden p-1 md:p-1.5">
    <StatementView partyType="all" />
  </div>
);

export default StatementsPage;
