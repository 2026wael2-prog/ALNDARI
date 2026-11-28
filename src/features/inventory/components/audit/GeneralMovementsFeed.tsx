import React, { useMemo, useState } from 'react';
import { exportGenericTableToExcel } from '@/core/utils/genericExcelExporter';
import type { InventoryMovementsFilterParams } from '../../types';
import { useInventoryMovementsFeed } from '../../hooks';
import {
  getDocTypeMeta,
  type MovementSelectedProduct,
  type MovementsStats,
} from './movements/docTypeLabels';
import { MovementsTable } from './movements/MovementsTable';
import { MovementsToolbarAndStats, type MovementTypeFilter } from './movements/MovementsToolbarAndStats';
import {
  MovementDocumentModals,
  type ActiveMovementDocument,
} from './movements/MovementDocumentModals';

interface GeneralMovementsFeedProps {
  onSelectProduct: (product: MovementSelectedProduct) => void;
}

const EXPORT_HEADERS = [
  'التاريخ والوقت',
  'نوع المستند',
  'رقم المستند',
  'اسم الصنف',
  'كود الصنف (SKU)',
  'رقم القطعة',
  'الماركة',
  'نوع الحركة',
  'الكمية',
  'الرصيد الحالي',
  'الطرف المقابل',
  'المستخدم',
  'ملاحظات',
];

export const GeneralMovementsFeed: React.FC<GeneralMovementsFeedProps> = ({ onSelectProduct }) => {
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState<MovementTypeFilter>('all');
  const [docType, setDocType] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeDocument, setActiveDocument] = useState<ActiveMovementDocument | null>(null);
  const [editingSalesInvoiceId, setEditingSalesInvoiceId] = useState<string | null>(null);

  const filterParams = useMemo<InventoryMovementsFilterParams>(
    () => ({
      search: search.trim() || undefined,
      movementType,
      docType: docType !== 'all' ? docType : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 200,
    }),
    [search, movementType, docType, startDate, endDate]
  );

  const {
    data: movements = [],
    isLoading,
    isRefetching,
    refetch,
  } = useInventoryMovementsFeed(filterParams);

  const stats = useMemo<MovementsStats>(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      if (m.movement_type === 'in') totalIn += Number(m.quantity || 0);
      else totalOut += Number(m.quantity || 0);
    }
    return {
      count: movements.length,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [movements]);

  const handleResetFilters = () => {
    setSearch('');
    setMovementType('all');
    setDocType('all');
    setStartDate('');
    setEndDate('');
  };

  const handleExport = () => {
    if (!movements.length) return;
    const exportRows = movements.map(m => [
      new Date(m.date).toLocaleString('ar-SA'),
      getDocTypeMeta(m.doc_type).label,
      m.doc_number,
      m.product_name,
      m.product_sku,
      m.product_part_number || '',
      m.product_brand || '',
      m.movement_type === 'in' ? 'وارد' : 'صادر',
      m.quantity,
      m.current_stock,
      m.party_name,
      m.user_name?.split('@')[0] || 'النظام',
      m.notes || '',
    ]);

    void exportGenericTableToExcel({
      title: 'سجل حركات المخزون العامة',
      subtitle: `إجمالي الحركات: ${movements.length}`,
      headers: EXPORT_HEADERS,
      rows: exportRows,
      colorTheme: 'blue',
    });
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <MovementsToolbarAndStats
        search={search}
        onSearchChange={setSearch}
        movementType={movementType}
        onMovementTypeChange={setMovementType}
        docType={docType}
        onDocTypeChange={setDocType}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        isRefreshing={isLoading || isRefetching}
        canExport={movements.length > 0}
        onRefresh={() => {
          void refetch();
        }}
        onExport={handleExport}
        stats={stats}
      />

      <MovementsTable
        movements={movements}
        isLoading={isLoading}
        onResetFilters={handleResetFilters}
        onSelectProduct={onSelectProduct}
        onOpenDocument={setActiveDocument}
        onEditInvoice={setEditingSalesInvoiceId}
      />

      <MovementDocumentModals
        activeDocument={activeDocument}
        editingSalesInvoiceId={editingSalesInvoiceId}
        onCloseDocument={() => setActiveDocument(null)}
        onCloseEditInvoice={() => setEditingSalesInvoiceId(null)}
      />
    </div>
  );
};

export default GeneralMovementsFeed;
