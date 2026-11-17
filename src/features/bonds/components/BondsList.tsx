import React from 'react';
import { FileText } from 'lucide-react';
import type { Bond } from '../types';
import { useBondActions } from '../hooks/useBondActions';
import { BondsTableView } from './list/BondsTableView';
import { BondsCardsView } from './list/BondsCardsView';

interface Props {
  bonds: Bond[];
  isLoading: boolean;
  searchTerm: string;
  displayMode?: 'table' | 'cards';
  onPreviewBond?: (bond: Bond) => void;
}

const BondsList: React.FC<Props> = ({
  bonds,
  isLoading,
  searchTerm,
  displayMode = 'cards',
  onPreviewBond,
}) => {
  const { filteredBonds, pageTotals, handleDelete, handleWhatsAppShare, handleExport } =
    useBondActions(bonds, searchTerm);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600/20 border-t-blue-600" />
        <div className="animate-pulse text-[10px] font-bold uppercase tracking-widest text-gray-400">
          جاري تحميل السندات...
        </div>
      </div>
    );
  }

  if (filteredBonds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-20 text-center text-xs font-bold uppercase tracking-widest text-gray-300 dark:border-slate-800">
        <FileText size={48} strokeWidth={1} />
        لا توجد سندات تطابق بحثك في هذه الفئة
      </div>
    );
  }

  if (displayMode === 'table') {
    return (
      <BondsTableView
        bonds={filteredBonds}
        pageTotals={pageTotals}
        onPreviewBond={onPreviewBond}
        onWhatsAppShare={bond => {
          void handleWhatsAppShare(bond);
        }}
        onExport={bond => {
          void handleExport(bond);
        }}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <BondsCardsView
      bonds={filteredBonds}
      onPreviewBond={onPreviewBond}
      onWhatsAppShare={bond => {
        void handleWhatsAppShare(bond);
      }}
      onExport={bond => {
        void handleExport(bond);
      }}
      onDelete={handleDelete}
    />
  );
};

export default BondsList;
