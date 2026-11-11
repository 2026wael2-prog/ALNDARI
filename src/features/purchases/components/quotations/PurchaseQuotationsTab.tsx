/* eslint-disable max-lines-per-function, complexity */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { purchaseQuotationsApi } from '../../api/quotationsApi';
import { shipmentsApi } from '../../api/shipmentsApi';
import type { PurchaseQuotationShipment } from '../../types/shipment';
import { useAuthStore } from '../../../auth/store';
import { usePurchaseStore } from '../../store';
import QuotationComparisonView from './QuotationComparisonView';
import CreatePurchaseQuotationModal from './create/CreatePurchaseQuotationModal';
import { QuotationGroupCard } from './QuotationGroupCard';
import { DetailedQuotationsTable } from './DetailedQuotationsTable';
import { PurchaseQuotationsHeader } from './PurchaseQuotationsHeader';
import { ShipmentsKpiWidget } from './shipment/ShipmentsKpiWidget';
import { PurchaseShipmentModal } from './shipment/PurchaseShipmentModal';
import QuotationDetailsModal from '../../../sales/components/quotations/QuotationDetailsModal';
import type { QuotationRowAction } from '../../../sales/components/quotations/QuotationActionIcons';
import {
  groupQuotations,
  matchesSearch,
  normalizeQuotations,
  type QuotationListRow,
} from './types';

interface Props {
  onConvertToPurchase?: () => void;
}

export const PurchaseQuotationsTab: React.FC<Props> = ({ onConvertToPurchase }) => {
  const { user } = useAuthStore();
  const [quotations, setQuotations] = useState<QuotationListRow[]>([]);
  const [shipments, setShipments] = useState<PurchaseQuotationShipment[]>([]);
  const [shipmentFilterStage, setShipmentFilterStage] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [compareGroupId, setCompareGroupId] = useState<string | null>(null);
  const [expandedQuotationId, setExpandedQuotationId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('table');
  // نافذة تتبع الشحنة البرية لمكتب الشحن
  const [activeShipment, setActiveShipment] = useState<{
    quotationId: string;
    quotationNumber?: string;
    supplierName?: string;
  } | null>(null);

  // إجراء صف العرض (إرسال واتساب/طباعة/إكسل) — يُفتح له قالب العرض المشترك.
  const [quotationAction, setQuotationAction] = useState<{
    quotationId: string;
    action: QuotationRowAction;
  } | null>(null);

  const handleQuotationAction = useCallback(
    (quotationId: string, action: QuotationRowAction): void => {
      setQuotationAction({ quotationId, action });
    },
    []
  );

  const handleOpenShipment = useCallback(
    (quotationId: string, quotationNumber: string, supplierName: string): void => {
      setActiveShipment({ quotationId, quotationNumber, supplierName });
    },
    []
  );

  const fetchQuotations = useCallback(async (): Promise<void> => {
    if (user?.company_id === undefined) return;
    setLoading(true);
    try {
      const response = await purchaseQuotationsApi.getQuotations(user.company_id);
      const rawData: unknown = response.data;
      setQuotations(normalizeQuotations(rawData));
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  const fetchShipments = useCallback(async (): Promise<void> => {
    if (user?.company_id === undefined) return;
    try {
      const list = await shipmentsApi.getCompanyShipments(user.company_id);
      setShipments(list);
    } catch {
      // Ignored
    }
  }, [user?.company_id]);

  useEffect(() => {
    void fetchQuotations();
    void fetchShipments();
  }, [fetchQuotations, fetchShipments]);

  // تحويل الشحنة المستلمة في المهرة مباشرة لفاتورة مشتريات
  const handleConvertFromShipment = useCallback(
    async (quotationId: string): Promise<void> => {
      const targetQuotation = quotations.find(q => q.id === quotationId);
      if (!targetQuotation) return;

      const { resetCart, setSupplier, bulkLoadItems } = usePurchaseStore.getState();
      resetCart();
      setSupplier({ id: 'temp', name: targetQuotation.supplier_name });

      if (targetQuotation.items.length > 0) {
        bulkLoadItems(
          targetQuotation.items.map(item => ({
            productId: '',
            name: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            costPrice: item.unit_price,
          }))
        );
      }

      await purchaseQuotationsApi.updateStatus(quotationId, 'converted');
      void fetchQuotations();
      if (onConvertToPurchase !== undefined) onConvertToPurchase();
    },
    [quotations, fetchQuotations, onConvertToPurchase]
  );

  // تصفية حسب مرحلة الشحن البري إن تم النقر على بطاقة في مؤشرات الشحن
  const matchingQuotationIdsForShipment = useMemo(() => {
    if (shipmentFilterStage === 'all') return null;
    return new Set(
      shipments
        .filter(s => {
          if (shipmentFilterStage === 'in_transit') {
            return s.tracking_status === 'in_transit' || s.tracking_status === 'handed_to_office';
          }
          return s.tracking_status === shipmentFilterStage;
        })
        .map(s => s.quotation_id)
    );
  }, [shipments, shipmentFilterStage]);

  const baseQuotations = useMemo(() => {
    if (matchingQuotationIdsForShipment === null) return quotations;
    return quotations.filter(q => matchingQuotationIdsForShipment.has(q.id));
  }, [quotations, matchingQuotationIdsForShipment]);

  const grouped = useMemo(() => groupQuotations(baseQuotations), [baseQuotations]);
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      normalizedSearch === ''
        ? grouped
        : grouped.filter(group => matchesSearch(group, normalizedSearch)),
    [grouped, normalizedSearch]
  );

  const filteredFlatQuotations = useMemo(
    () =>
      normalizedSearch === ''
        ? baseQuotations
        : baseQuotations.filter(
            quotation =>
              quotation.quotation_number.toLowerCase().includes(normalizedSearch) ||
              quotation.supplier_name.toLowerCase().includes(normalizedSearch) ||
              quotation.items.some(
                item =>
                  item.description.toLowerCase().includes(normalizedSearch) ||
                  Boolean(item.part_number?.toLowerCase().includes(normalizedSearch)) ||
                  Boolean(item.size?.toLowerCase().includes(normalizedSearch))
              )
          ),
    [baseQuotations, normalizedSearch]
  );

  return (
    <div className="space-y-4">
      {/* مؤشرات الشحنات البرية (خط صنعاء - المهرة) */}
      <ShipmentsKpiWidget
        shipments={shipments}
        selectedStage={shipmentFilterStage}
        onFilterStage={stage => {
          setShipmentFilterStage(stage);
        }}
      />

      <PurchaseQuotationsHeader
        totalQuotations={quotations.length}
        totalGroups={grouped.length}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenCreateModal={() => {
          setShowCreateModal(true);
        }}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />

      {compareGroupId !== null && (
        <QuotationComparisonView
          rfqGroupId={compareGroupId}
          onClose={() => {
            setCompareGroupId(null);
          }}
          {...(onConvertToPurchase !== undefined ? { onConvertToPurchase } : {})}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 py-12 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <FileText size={40} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="font-medium text-gray-500 dark:text-gray-400">
            {shipmentFilterStage !== 'all'
              ? 'لا توجد عروض أسعار مطابقة لفلتر الشحن المحدد'
              : 'لا توجد عروض أسعار من الموردين'}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {shipmentFilterStage !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setShipmentFilterStage('all');
                }}
                className="text-blue-600 hover:underline dark:text-blue-400 font-bold"
              >
                إلغاء تصفية الشحن وعرض جميع العروض
              </button>
            ) : (
              'سجّل عروض الموردين للمقارنة بينها وتتبع شحنها البري'
            )}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <DetailedQuotationsTable
          quotations={filteredFlatQuotations}
          onQuotationAction={handleQuotationAction}
          onOpenShipment={handleOpenShipment}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(group => (
            <QuotationGroupCard
              key={group.groupId}
              group={group}
              compareGroupId={compareGroupId}
              expandedQuotationId={expandedQuotationId}
              onToggleQuotation={id => {
                setExpandedQuotationId(current => (current === id ? null : id));
              }}
              onCompare={groupId => {
                setCompareGroupId(compareGroupId === groupId ? null : groupId);
              }}
              onQuotationAction={handleQuotationAction}
              onOpenShipment={handleOpenShipment}
            />
          ))}
        </div>
      )}

      {/* نافذة تفاصيل العرض (طباعة / إكسل / مشاركة) */}
      {quotationAction !== null && (
        <QuotationDetailsModal
          quotationId={quotationAction.quotationId}
          initialAction={quotationAction.action}
          onClose={() => {
            setQuotationAction(null);
          }}
          onRefresh={() => {
            void fetchQuotations();
          }}
        />
      )}

      {/* نافذة تتبع الشحنة البرية عبر مكاتب الشحن (خط صنعاء - المهرة) */}
      {activeShipment !== null && (
        <PurchaseShipmentModal
          quotationId={activeShipment.quotationId}
          quotationNumber={activeShipment.quotationNumber}
          supplierName={activeShipment.supplierName}
          onClose={() => {
            setActiveShipment(null);
          }}
          onSuccess={() => {
            void fetchQuotations();
            void fetchShipments();
          }}
          onConvertToPurchase={handleConvertFromShipment}
        />
      )}

      {showCreateModal && (
        <CreatePurchaseQuotationModal
          onClose={() => {
            setShowCreateModal(false);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            void fetchQuotations();
          }}
        />
      )}
    </div>
  );
};

export default PurchaseQuotationsTab;
