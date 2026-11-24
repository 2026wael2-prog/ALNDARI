import React from 'react';
import { Loader2 } from 'lucide-react';
import { useChatwootWidgetController } from './hooks/useChatwootWidgetController';
import {
  CustomerNotFoundCard,
  CustomerSearchSection,
  FullOfficeHeader,
  StandaloneWidgetHeader,
} from './components/ChatwootHeaders';
import {
  CustomerOverviewColumn,
  PaymentPromisesCard,
  RecentInvoicesCard,
} from './components/ChatwootCustomerPanels';

export const ChatwootWidgetPage: React.FC = () => {
  const ctrl = useChatwootWidgetController();
  const refreshCustomer = (): void => {
    void ctrl.fetchCustomer(ctrl.phoneQuery);
  };

  return (
    <div
      className={
        ctrl.isStandalone
          ? 'min-h-screen bg-slate-50/80 p-3 font-sans text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-100 sm:p-5'
          : 'mx-auto w-full max-w-7xl p-3.5 font-sans text-slate-800 antialiased dark:text-slate-100 sm:p-6'
      }
      dir="rtl"
    >
      <div className={ctrl.isStandalone ? 'mx-auto max-w-3xl' : 'mx-auto w-full'}>
        {!ctrl.isStandalone ? (
          <FullOfficeHeader
            isLoading={ctrl.isLoading}
            copiedWidgetUrl={ctrl.copiedWidgetUrl}
            onOpenWhatsApp={ctrl.handleOpenWhatsAppWeb}
            onCopyWidgetUrl={ctrl.handleCopyWidgetUrl}
            onRefresh={refreshCustomer}
          />
        ) : (
          <StandaloneWidgetHeader isLoading={ctrl.isLoading} onRefresh={refreshCustomer} />
        )}

        <CustomerSearchSection
          phoneQuery={ctrl.phoneQuery}
          onPhoneQueryChange={ctrl.setPhoneQuery}
          onSearch={q => {
            void ctrl.fetchCustomer(q);
          }}
          recentParties={ctrl.recentParties}
          hasLoadedCustomer={ctrl.data !== null}
        />

        {ctrl.isLoading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-12 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
            <Loader2 size={26} className="animate-spin text-emerald-600" />
            <span className="mt-2.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              جارٍ قراءة أرصدة وفواتير العميل...
            </span>
          </div>
        )}

        {!ctrl.isLoading && ctrl.notFound && <CustomerNotFoundCard phoneQuery={ctrl.phoneQuery} />}

        {!ctrl.isLoading && ctrl.data && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CustomerOverviewColumn
              data={ctrl.data}
              copiedSummary={ctrl.copiedSummary}
              onOpenWhatsApp={ctrl.handleOpenWhatsAppWeb}
              onCopySummary={ctrl.handleCopySummary}
            />

            <div className="space-y-3">
              <PaymentPromisesCard
                promises={ctrl.data.pendingPromises}
                showPromiseForm={ctrl.showPromiseForm}
                onToggleForm={() => ctrl.setShowPromiseForm(!ctrl.showPromiseForm)}
                promiseFeedback={ctrl.promiseFeedback}
                promiseForm={ctrl.promiseForm}
                onAmountChange={ctrl.setPromiseAmount}
                onCurrencyChange={ctrl.setPromiseCurrency}
                onDateChange={ctrl.setPromiseDate}
                onNotesChange={ctrl.setPromiseNotes}
                onSubmit={ctrl.handleAddPromise}
              />

              <RecentInvoicesCard invoices={ctrl.data.recentInvoices} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatwootWidgetPage;
