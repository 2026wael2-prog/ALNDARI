import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, CheckCircle2, Save, X } from 'lucide-react';
import { cn, formatCurrency } from '../../../../core/utils';
import PageLoader from '../../../../ui/base/PageLoader';
import { useEditInvoiceForm } from './useEditInvoiceForm';
import { EditInvoiceMetaBar } from './EditInvoiceMetaBar';
import { EditInvoiceItemsSection } from './EditInvoiceItemsSection';
import { EditInvoiceConfirmDialog } from './EditInvoiceConfirmDialog';

interface EditInvoiceModalProps {
  invoiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  invoiceId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const form = useEditInvoiceForm({ invoiceId, onClose, onSuccess });

  if (!isOpen) return null;

  return createPortal(
    <div className="animate-in fade-in fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-2 duration-100 sm:p-4">
      <div
        style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600/15 text-blue-600 dark:text-blue-400">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[var(--app-text)]">
                  تعديل فاتورة مبيعات{' '}
                  {form.invoice?.invoice_number ? `#${form.invoice.invoice_number}` : ''}
                </h2>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold',
                    form.invoice?.status === 'paid'
                      ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  )}
                >
                  {form.invoice?.status === 'paid' ? 'مدفوعة' : 'مرحلة'}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--app-text-secondary)]">
                تعديل الأصناف، الأسعار، العميل، طريقة الدفع مع تسوية القيود والمخزون تلقائياً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {form.invoiceLoading ? (
          <div className="flex h-96 items-center justify-center">
            <PageLoader />
          </div>
        ) : form.invoiceError ? (
          <div className="p-10 text-center font-bold text-rose-600 dark:text-rose-400">
            حدث خطأ أثناء تحميل بيانات الفاتورة.
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <EditInvoiceMetaBar
              partyId={form.partyId}
              customerName={form.customerName}
              onSelectParty={(id, name) => {
                form.setPartyId(id);
                form.setCustomerName(name);
              }}
              paymentMethod={form.paymentMethod}
              onPaymentMethodChange={form.setPaymentMethod}
              paymentAccountId={form.paymentAccountId}
              onPaymentAccountChange={form.setPaymentAccountId}
              paymentAccounts={form.paymentAccounts}
              issueDate={form.issueDate}
              onIssueDateChange={form.setIssueDate}
              currencyCode={form.currencyCode}
              originalCurrency={form.originalCurrency}
              isCurrencyChanged={form.isCurrencyChanged}
              exchangeRateDisplay={form.exchangeRateDisplay}
              onExchangeRateChange={form.setExchangeRateDisplay}
              onCurrencyChange={form.handleCurrencyChange}
            />

            <EditInvoiceItemsSection
              companyId={form.companyId}
              currencyCode={form.currencyCode}
              items={form.items}
              onAddProduct={form.handleAddProduct}
              onQuantityChange={form.handleQuantityChange}
              onUnitPriceChange={form.handleUnitPriceChange}
              onDiscountChange={form.handleDiscountChange}
              onRemoveItem={form.handleRemoveItem}
            />

            {/* Notes & Summary */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--app-text-secondary)]">
                  ملاحظات الفاتورة
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={e => form.setNotes(e.target.value)}
                  placeholder="أدخل أي ملاحظات تخص الفاتورة أو سبب التعديل..."
                  className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 text-xs text-[var(--app-text)] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-4">
                <div className="flex justify-between text-xs font-medium text-[var(--app-text-secondary)]">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                    {formatCurrency(form.summary.subtotal, form.currencyCode)}
                  </span>
                </div>
                {form.summary.discount > 0 && (
                  <div className="flex justify-between text-xs font-medium text-rose-600 dark:text-rose-400">
                    <span>إجمالي الخصم:</span>
                    <span className="font-mono font-bold" dir="ltr">
                      -{formatCurrency(form.summary.discount, form.currencyCode)}
                    </span>
                  </div>
                )}
                {form.summary.tax > 0 && (
                  <div className="flex justify-between text-xs font-medium text-[var(--app-text-secondary)]">
                    <span>الضريبة:</span>
                    <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                      {formatCurrency(form.summary.tax, form.currencyCode)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[var(--app-border)] pt-2 text-sm font-black text-[var(--app-text)]">
                  <span>الإجمالي الجديد:</span>
                  <span
                    className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400"
                    dir="ltr"
                  >
                    {formatCurrency(form.summary.total, form.currencyCode)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 text-xs">
                  <div className="flex justify-between font-medium text-[var(--app-text-secondary)]">
                    <span>الإجمالي السابق ({form.originalCurrency}):</span>
                    <span className="font-mono font-bold text-[var(--app-text)]" dir="ltr">
                      {formatCurrency(form.oldDocumentTotal, form.originalCurrency)}
                    </span>
                  </div>
                  {!form.isCurrencyChanged && (
                    <div className="flex justify-between font-bold text-[var(--app-text)]">
                      <span>الفارق المحاسبي:</span>
                      <span
                        className={cn(
                          'font-mono font-black',
                          form.difference > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : form.difference < 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[var(--app-text-secondary)]'
                        )}
                        dir="ltr"
                      >
                        {form.difference > 0
                          ? `+${formatCurrency(form.difference, form.currencyCode)}`
                          : formatCurrency(form.difference, form.currencyCode)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-900 dark:text-blue-200">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={16} className="shrink-0 text-blue-600 dark:text-blue-400" />
                <span>المعالجة المحاسبية والمخزنية الآلية:</span>
              </div>
              <ul className="list-disc space-y-0.5 pr-6 text-[11px] font-medium">
                <li>تسوية المخزون فورياً: إرجاع كميات الأصناف المحذوفة/المخفضة وخصم الأصناف الجديدة.</li>
                <li>تحديث قيود اليومية للعميل، الخزينة، إيراد المبيعات، والضريبة لتطابق الإجمالي الجديد.</li>
                <li>تحديث رصيد العميل وكشف الحساب تلقائياً دون أي تأثير جانبي أو تعارض.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--app-border)] bg-[var(--app-bg)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={form.isUpdating}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)]"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={form.handleSave}
            disabled={form.isUpdating || form.invoiceLoading || form.items.length === 0}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          >
            <Save size={15} />
            <span>حفظ التعديلات واعتماد القيود</span>
          </button>
        </div>

        {form.showConfirm && (
          <EditInvoiceConfirmDialog
            customerName={form.customerName}
            paymentMethod={form.paymentMethod}
            itemsCount={form.items.length}
            total={form.summary.total}
            currencyCode={form.currencyCode}
            isUpdating={form.isUpdating}
            onCancel={() => form.setShowConfirm(false)}
            onConfirm={form.executeSave}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default EditInvoiceModal;
