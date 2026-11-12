import React from 'react';
import { History, Maximize2, Minimize2, X, Download } from 'lucide-react';
import { cn, formatNumberDisplay } from '../../../../core/utils';
import { exportGenericTableToExcel } from '../../../../core/utils/genericExcelExporter';
import type { ItemMovementRow } from '../../types';

/**
 * الحقول التي يعرضها هذا الرأس من الصنف المحدد فقط — نوع بنيوي (structural)
 * بدل `any` كي تبقى كل قراءة معروفة النوع ولا تتسرّب قيم غير متوقعة إلى التصدير.
 */
export interface AuditLogProduct {
  name_ar?: string | null;
  name?: string | null;
  sku?: string | null;
  part_number?: string | null;
  brand?: string | null;
  stock_quantity?: number | null;
}

interface AuditLogHeaderProps {
  selectedProduct: AuditLogProduct;
  log: ItemMovementRow[] | undefined;
  isMaximized: boolean;
  setIsMaximized: (maximized: boolean) => void;
  onBack?: () => void;
}

const AuditLogHeader: React.FC<AuditLogHeaderProps> = ({
    selectedProduct,
    log,
    isMaximized,
    setIsMaximized,
    onBack
}) => {
    const handleExport = (): void => {
        if (!log || log.length === 0) return;
        const rows = log.map((entry, index) => [
            log.length - index,
            new Date(entry.date).toLocaleString('en-GB'),
            entry.document_number ?? '',
            entry.reference_type ?? '',
            entry.source_name ?? '',
            entry.transaction_type === 'in' ? 'وارد' : 'صادر',
            entry.quantity,
            entry.balance_after ?? 0,
            entry.source_user ?? ''
        ]);

        const headers = [
            '#',
            'التاريخ والوقت',
            'رقم المستند',
            'نوع الحركة',
            'الجهة / العميل / المورد',
            'الاتجاه',
            'الكمية',
            'الرصيد بعدها',
            'المستخدم المسؤول'
        ];

        const productName = selectedProduct.name_ar ?? selectedProduct.name ?? 'item';
        void exportGenericTableToExcel({
            title: `سجل حركة الصنف: ${productName}`,
            subtitle: `رمز الصنف (SKU): ${selectedProduct.sku ?? '—'} | رقم القطعة: ${selectedProduct.part_number ?? '—'}`,
            headers,
            rows,
            colorTheme: 'blue',
        });
    };

    const productName = selectedProduct.name_ar ?? selectedProduct.name ?? 'الصنف';
    // قيم مُطبَّعة مسبقًا: تقارن صراحةً مع '' فتحقّق `strict-boolean-expressions`
    // ولا تُمرّر null إلى formatNumberDisplay.
    const sku = selectedProduct.sku ?? '';
    const partNumber = selectedProduct.part_number ?? '';
    const brand = selectedProduct.brand ?? '';
    const stockQuantity = selectedProduct.stock_quantity ?? 0;
    const movementsCount = log?.length ?? 0;

    return (
        <div className={cn(
            "p-5 border-b dark:border-slate-800 flex items-center justify-between transition-all",
            isMaximized ? "bg-slate-50 dark:bg-slate-800/50 py-8 px-10" : "bg-gray-50/50 dark:bg-slate-900/50"
        )}>
            <div className="flex items-center gap-4">
                {onBack && !isMaximized && (
                    <button 
                        onClick={onBack}
                        className="p-2.5 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm text-gray-500 hover:text-blue-500 transition-all active:scale-90"
                        title="رجوع للقائمة"
                    >
                        <X size={18} />
                    </button>
                )}
                <div className={cn(
                    "p-3 bg-blue-600/10 text-blue-600 rounded-2xl shrink-0",
                    isMaximized && "p-4"
                )}>
                    <History size={isMaximized ? 24 : 18} />
                </div>
                <div>
                    <h3 className={cn(
                        "text-sm font-black text-gray-900 dark:text-white flex flex-wrap items-center gap-2",
                        isMaximized && "text-xl"
                    )}>
                        <span>{productName}</span>
                        {sku !== '' && (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20">
                                {sku}
                            </span>
                        )}
                        {partNumber !== '' && (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold border dark:border-slate-700">
                                {partNumber}
                            </span>
                        )}
                        {brand !== '' && (
                            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                                {brand}
                            </span>
                        )}
                    </h3>
                    <p className={cn(
                        "text-[10px] text-gray-500 font-medium tracking-tight mt-0.5",
                        isMaximized && "text-xs mt-1"
                    )}>
                        سجل الحركات المخزنية والبيعية التراكمي في الوقت الفعلي
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-6">
                    <div className="text-right">
                        <p className={cn("font-black text-gray-900 dark:text-white font-mono leading-none", isMaximized ? "text-2xl" : "text-sm")}>
                            {formatNumberDisplay(stockQuantity)}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-1">الرصيد الكلي الحالي</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200 dark:bg-slate-800" />
                    <div className="text-right">
                        <p className={cn("font-black text-gray-900 dark:text-white font-mono leading-none", isMaximized ? "text-2xl" : "text-sm")}>
                            {movementsCount}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-1">إجمالي الحركات</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {Boolean(log && log.length > 0) && (
                        <button
                            onClick={handleExport}
                            className="p-2.5 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm text-gray-600 hover:text-emerald-600 dark:text-gray-300 transition-all active:scale-90 flex items-center gap-1.5 text-xs font-bold"
                            title="تصدير إلى Excel / CSV"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">تصدير</span>
                        </button>
                    )}

                    <button 
                        onClick={() => { setIsMaximized(!isMaximized); }}
                        className="p-2.5 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm text-gray-500 hover:text-blue-500 transition-all active:scale-90"
                        title={isMaximized ? "تصغير" : "تكبير"}
                    >
                        {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                    
                    {isMaximized && (
                        <button 
                            onClick={() => { setIsMaximized(false); }}
                            className="p-2.5 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-500/20 transition-all active:scale-90"
                            title="إغلاق وضع ملء الشاشة"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuditLogHeader;
