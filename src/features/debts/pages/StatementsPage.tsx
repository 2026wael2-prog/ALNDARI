import type React from 'react';
import StatementView from '../../parties/components/StatementView';

/**
 * Unified Statements page — full-screen account statement view supporting
 * both customers and suppliers from a single unified smart search bar.
 */
const StatementsPage: React.FC = () => (
  <div className="flex min-h-[calc(100vh-110px)] w-full flex-col">
    <StatementView partyType="all" />
  </div>
);

export default StatementsPage;
