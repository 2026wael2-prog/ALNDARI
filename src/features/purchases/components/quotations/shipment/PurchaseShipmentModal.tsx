import React from 'react';
import {
  CheckCircle2,
  Loader2,
  Navigation,
  Save,
  Truck,
  X,
} from 'lucide-react';
import { ShipmentTrackingStepper } from './ShipmentTrackingStepper';
import { AddCarrierModal } from './AddCarrierModal';
import { useShipmentForm } from './hooks/useShipmentForm';
import { ShipmentRouteSection } from './sections/ShipmentRouteSection';
import { ShipmentCarrierSection } from './sections/ShipmentCarrierSection';
import { ShipmentDriverSection } from './sections/ShipmentDriverSection';
import { ShipmentPackageSection } from './sections/ShipmentPackageSection';
import { ShipmentTimelineTab } from './sections/ShipmentTimelineTab';
import { ShipmentShareTab } from './sections/ShipmentShareTab';

interface PurchaseShipmentModalProps {
  quotationId: string;
  quotationNumber?: string | undefined;
  supplierName?: string | undefined;
  onClose: () => void;
  onSuccess?: (() => void) | undefined;
  onConvertToPurchase?: ((quotationId: string) => void | Promise<void>) | undefined;
}

export const PurchaseShipmentModal: React.FC<PurchaseShipmentModalProps> = ({
  quotationId,
  quotationNumber,
  supplierName,
  onClose,
  onSuccess,
  onConvertToPurchase,
}) => {
  const form = useShipmentForm({
    quotationId,
    quotationNumber,
    supplierName,
    onSuccess,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--app-surface)] w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Truck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  بوليصة الشحن والتتبع البري للمهرة
                </h3>
                {quotationNumber && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold">
                    عرض #{quotationNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
                <span>المورد: {supplierName || 'غير محدد'}</span>
                <span>•</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                  <Navigation size={12} />
                  خط السير: {form.originCity} ⟵ المهرة (الغيضة)
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Interactive Stage Stepper */}
        <div className="px-6 py-4 bg-gray-50/60 dark:bg-slate-900/40 border-b border-gray-100 dark:border-slate-800">
          <ShipmentTrackingStepper
            currentStage={form.trackingStatus}
            interactive={true}
            originCity={form.originCity}
            onSelectStage={form.handleStageChange}
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-gray-100 dark:border-slate-800 bg-[var(--app-surface)]">
          <button
            type="button"
            onClick={() => form.setActiveTab('details')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative cursor-pointer ${
              form.activeTab === 'details'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            بيانات الشحنة والناقل
          </button>
          <button
            type="button"
            onClick={() => form.setActiveTab('timeline')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative cursor-pointer ${
              form.activeTab === 'timeline'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            خط السير والمحطات ({form.timeline.length})
          </button>
          <button
            type="button"
            onClick={() => form.setActiveTab('share')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative cursor-pointer ${
              form.activeTab === 'share'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            مشاركة واتساب وإشعارات
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {form.loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <span className="text-xs">جاري تحميل بيانات الشحنة وبوليصة النقل...</span>
            </div>
          ) : form.activeTab === 'details' ? (
            <form onSubmit={form.handleSave} className="space-y-5">
              <ShipmentRouteSection
                routeCode={form.routeCode}
                onCorridorChange={form.handleCorridorChange}
                requestingBranchId={form.requestingBranchId}
                onRequestingBranchIdChange={form.setRequestingBranchId}
                destinationBranchId={form.destinationBranchId}
                onDestinationBranchIdChange={form.setDestinationBranchId}
                branches={form.branches}
                onSelectBranchWarehouse={branchId => {
                  const branchWh = form.warehouses.find(w => w.branch_id === branchId);
                  if (branchWh) form.setDestinationWarehouseId(branchWh.id);
                }}
              />

              <ShipmentCarrierSection
                carriers={form.carriers}
                selectedCarrierId={form.selectedCarrierId}
                onCarrierChange={form.handleCarrierChange}
                shippingCompany={form.shippingCompany}
                onShippingCompanyChange={company => {
                  form.setShippingCompany(company);
                  form.setCustomCompanyName(company);
                }}
                originCity={form.originCity}
                originHub={form.originHub}
                onOriginHubChange={form.setOriginHub}
                waybillNumber={form.waybillNumber}
                onWaybillNumberChange={form.setWaybillNumber}
                officePhone={form.officePhone}
                onOfficePhoneChange={form.setOfficePhone}
                destinationHub={form.destinationHub}
                onDestinationHubChange={form.setDestinationHub}
                onOpenAddCarrierModal={() => form.setShowAddCarrierModal(true)}
              />

              <ShipmentDriverSection
                drivers={form.drivers}
                selectedDriverId={form.selectedDriverId}
                onDriverChange={form.handleDriverChange}
                driverName={form.driverName}
                onDriverNameChange={name => {
                  form.setDriverName(name);
                  form.handleDriverChange('other');
                }}
                driverPhone={form.driverPhone}
                onDriverPhoneChange={form.setDriverPhone}
                vehiclePlateNumber={form.vehiclePlateNumber}
                onVehiclePlateNumberChange={form.setVehiclePlateNumber}
                vehicleType={form.vehicleType}
                onVehicleTypeChange={form.setVehicleType}
              />

              <ShipmentPackageSection
                parcelCount={form.parcelCount}
                onParcelCountChange={form.setParcelCount}
                weightKg={form.weightKg}
                onWeightKgChange={form.setWeightKg}
                destinationWarehouseId={form.destinationWarehouseId}
                onDestinationWarehouseIdChange={form.setDestinationWarehouseId}
                destinationBranchId={form.destinationBranchId}
                warehouses={form.warehouses}
                branches={form.branches}
                cargoDescription={form.cargoDescription}
                onCargoDescriptionChange={form.setCargoDescription}
                shippingCost={form.shippingCost}
                onShippingCostChange={form.setShippingCost}
                shippingCurrency={form.shippingCurrency}
                onShippingCurrencyChange={form.setShippingCurrency}
                paymentMethod={form.paymentMethod}
                onPaymentMethodChange={form.setPaymentMethod}
                shippingDate={form.shippingDate}
                onShippingDateChange={form.setShippingDate}
                expectedArrivalDate={form.expectedArrivalDate}
                onExpectedArrivalDateChange={form.setExpectedArrivalDate}
                notes={form.notes}
                onNotesChange={form.setNotes}
              />
            </form>
          ) : form.activeTab === 'timeline' ? (
            <ShipmentTimelineTab
              originCity={form.originCity}
              transitStations={form.transitStations}
              selectedStation={form.selectedStation}
              onSelectedStationChange={form.setSelectedStation}
              stationNote={form.stationNote}
              onStationNoteChange={form.setStationNote}
              onAddCheckpoint={form.handleAddCheckpoint}
              timeline={form.timeline}
            />
          ) : (
            <ShipmentShareTab
              currentShipmentPreview={form.currentShipmentPreview}
              driverPhone={form.driverPhone}
              driverName={form.driverName}
              officePhone={form.officePhone}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            {(form.trackingStatus === 'arrived_at_office' ||
              form.trackingStatus === 'received_at_warehouse') &&
              onConvertToPurchase && (
                <button
                  type="button"
                  onClick={() => {
                    onConvertToPurchase(quotationId);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  تحويل لفاتورة مشتريات وتوريد المخزن
                </button>
              )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 text-xs font-bold transition-colors cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => form.handleSave()}
              disabled={form.saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {form.saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ بيانات الشحنة
            </button>
          </div>
        </div>
      </div>

      {form.showAddCarrierModal && form.user?.company_id && (
        <AddCarrierModal
          isOpen={form.showAddCarrierModal}
          onClose={() => form.setShowAddCarrierModal(false)}
          onCarrierAdded={form.handleCarrierAdded}
          companyId={form.user.company_id}
        />
      )}
    </div>
  );
};

export default PurchaseShipmentModal;
