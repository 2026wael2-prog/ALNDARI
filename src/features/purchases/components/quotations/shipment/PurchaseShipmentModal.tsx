/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/strict-boolean-expressions, complexity, jsx-a11y/label-has-associated-control, max-lines-per-function, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-conversion, react-hooks/exhaustive-deps, @typescript-eslint/no-deprecated, security/detect-object-injection */
import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Compass,
  DollarSign,
  GitBranch,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Plus,
  Save,
  Share2,
  Truck,
  User,
  Warehouse,
  X,
} from 'lucide-react';
import { shipmentsApi } from '../../../api/shipmentsApi';
import { purchaseQuotationsApi } from '../../../api/quotationsApi';
import { useAuthStore } from '../../../../auth/store';
import { useFeedbackStore } from '../../../../feedback/store';
import { useWarehouses } from '../../../../inventory/hooks/useWarehouses';
import { useBranches } from '../../../../settings/hooks';
import { formatLocalDate } from '../../../../../core/utils/dateUtils';
import {
  SHIPPING_CORRIDORS,
  type CarrierOption,
  type DriverOption,
  type PurchaseQuotationShipment,
  type ShipmentTimelineEvent,
  type ShipmentTrackingStage,
  type ShippingCorridorCode,
  type ShippingPaymentMethod,
  type TransitStation,
  type UpsertShipmentDTO,
} from '../../../types/shipment';
import { ShipmentTrackingStepper } from './ShipmentTrackingStepper';
import { AddCarrierModal } from './AddCarrierModal';
import {
  generateShipmentWhatsAppMessage,
  openWhatsAppShipmentShare,
} from './ShipmentWhatsAppShare';

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
  const { user } = useAuthStore();
  const { showToast } = useFeedbackStore();
  const { data: rawWarehouses } = useWarehouses();
  const warehouses = Array.isArray(rawWarehouses) ? rawWarehouses : [];
  const { data: rawBranches } = useBranches();
  const rawBranchesList = Array.isArray(rawBranches) ? rawBranches : [];
  const branches = rawBranchesList.filter(b => b.status === 'active');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'share'>('details');

  // مسار وممر الشحن البري المعتمد
  const [routeCode, setRouteCode] = useState<ShippingCorridorCode>('sanaa_mahrah');
  const [transitStations, setTransitStations] = useState<TransitStation[]>(SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations);

  // تحديد الفروع المعنية (صاحب الطلب وفرع الوصول بالمهرة)
  const [requestingBranchId, setRequestingBranchId] = useState<string>('');
  const [destinationBranchId, setDestinationBranchId] = useState<string>('');

  // مكاتب وشركات النقل الحقيقية من قاعدة بيانات سوبابيز
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('other');
  const [showAddCarrierModal, setShowAddCarrierModal] = useState(false);

  // السائقون الحقيقيون من قاعدة بيانات سوبابيز
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('other');

  // Shipment State
  const [shipmentId, setShipmentId] = useState<string | undefined>(undefined);
  const [shippingCompany, setShippingCompany] = useState('');
  const [customCompanyName, setCustomCompanyName] = useState('');
  const [officePhone, setOfficePhone] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [waybillNumber, setWaybillNumber] = useState('');

  const [originCity, setOriginCity] = useState('صنعاء');
  const [originHub, setOriginHub] = useState('');
  const [destinationCity, setDestinationCity] = useState('المهرة (الغيضة)');
  const [destinationHub, setDestinationHub] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>('');

  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('شاحنة نقل (دينا)');

  const [parcelCount, setParcelCount] = useState<number>(1);
  const [weightKg, setWeightKg] = useState<number>(0);
  const [cargoDescription, setCargoDescription] = useState('قطع غيار سيارات');

  const [shippingCost, setShippingCost] = useState<number>(0);
  const [shippingCurrency, setShippingCurrency] = useState('YER');
  const [paymentMethod, setPaymentMethod] = useState<ShippingPaymentMethod>('collect_on_delivery');

  const [shippingDate, setShippingDate] = useState(formatLocalDate(new Date()));
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(formatLocalDate(new Date()));
  const [trackingStatus, setTrackingStatus] = useState<ShipmentTrackingStage>('handed_to_office');

  const [notes, setNotes] = useState('');
  const [timeline, setTimeline] = useState<PurchaseQuotationShipment['timeline']>([]);

  // New Checkpoint Station Input
  const [selectedStation, setSelectedStation] = useState(SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations[0].name);
  const [stationNote, setStationNote] = useState('');

  // Load existing shipment and real carriers and drivers from Supabase
  useEffect(() => {
    let isMounted = true;
    const fetchShipmentAndCarriers = async () => {
      if (!user?.company_id) return;
      setLoading(true);
      try {
        const [existing, realCarriers, realDrivers] = await Promise.all([
          shipmentsApi.getShipmentByQuotationId(quotationId, user.company_id),
          shipmentsApi.getCarriers(user.company_id),
          shipmentsApi.getDrivers(user.company_id),
        ]);

        if (isMounted) {
          setCarriers(realCarriers);
          setDrivers(realDrivers);

          if (existing) {
            setShipmentId(existing.id);
            setShippingCompany(existing.shipping_company_name);
            const matchedCarrier = realCarriers.find(c => c.name === existing.shipping_company_name);
            if (matchedCarrier) {
              setSelectedCarrierId(matchedCarrier.id);
            } else {
              setSelectedCarrierId('other');
              setCustomCompanyName(existing.shipping_company_name);
            }
            setOfficePhone(existing.shipping_office_phone);
            setOfficeAddress(existing.shipping_office_address);
            setWaybillNumber(existing.waybill_number);

            const corridor: ShippingCorridorCode = existing.route_code ?? 'sanaa_mahrah';
            setRouteCode(corridor);
            const activeCorridor = SHIPPING_CORRIDORS[corridor] || SHIPPING_CORRIDORS.sanaa_mahrah;
            setTransitStations(activeCorridor.defaultTransitStations);
            setSelectedStation(activeCorridor.defaultTransitStations[0]?.name || 'صنعاء');

            setOriginCity(existing.origin_city);
            setOriginHub(existing.origin_hub || '');
            setDestinationCity(existing.destination_city);
            setDestinationHub(existing.destination_hub || '');

            setRequestingBranchId(existing.requesting_branch_id || user.branch_id || '');
            setDestinationBranchId(existing.destination_branch_id || '');
            setDestinationWarehouseId(existing.destination_warehouse_id || '');

            setDriverName(existing.driver_name);
            setDriverPhone(existing.driver_phone);
            const matchedDriver = realDrivers.find(
              d => d.name === existing.driver_name || (d.phone && d.phone === existing.driver_phone)
            );
            if (matchedDriver) {
              setSelectedDriverId(matchedDriver.id);
            } else {
              setSelectedDriverId('other');
            }

            setVehiclePlateNumber(existing.vehicle_plate_number);
            setVehicleType(existing.vehicle_type);
            setParcelCount(existing.parcel_count);
            setWeightKg(existing.weight_kg);
            setCargoDescription(existing.cargo_description);
            setShippingCost(existing.shipping_cost);
            setShippingCurrency(existing.shipping_currency);
            setPaymentMethod(existing.payment_method);
            setShippingDate(existing.shipping_date);
            setExpectedArrivalDate(existing.expected_arrival_date);
            setTrackingStatus(existing.tracking_status);
            setNotes(existing.notes || '');
            setTimeline(existing.timeline || []);
          } else {
            if (user.branch_id) {
              setRequestingBranchId(user.branch_id);
            }
            if (warehouses.length > 0 && !destinationWarehouseId) {
              const primaryWh = warehouses.find(w => Boolean(w.is_primary));
              setDestinationWarehouseId(primaryWh ? primaryWh.id : warehouses[0].id);
              if (primaryWh?.branch_id) {
                setDestinationBranchId(primaryWh.branch_id);
              }
            }
          }
        }
      } catch {
        // Fallback or empty
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void fetchShipmentAndCarriers();
    return () => {
      isMounted = false;
    };
  }, [quotationId, user?.company_id]);

  // Handle Corridor Change
  const handleCorridorChange = (newCode: ShippingCorridorCode) => {
    setRouteCode(newCode);
    const corridor = SHIPPING_CORRIDORS[newCode];
    if (corridor) {
      if (newCode !== 'custom') {
        setOriginCity(corridor.originCity);
        setOriginHub(corridor.defaultOriginHub);
        setDestinationCity(corridor.destinationCity);
      }
      setTransitStations(corridor.defaultTransitStations);
      if (corridor.defaultTransitStations.length > 0) {
        setSelectedStation(corridor.defaultTransitStations[0].name);
      }
    }
  };

  // Handle Driver Select
  const handleDriverChange = (driverId: string) => {
    setSelectedDriverId(driverId);
    if (driverId !== 'other') {
      const driver = drivers.find(d => d.id === driverId);
      if (driver) {
        setDriverName(driver.name);
        setDriverPhone(driver.phone || '');
      }
    }
  };

  // Handle Real Carrier Change
  const handleCarrierChange = (carrierId: string) => {
    setSelectedCarrierId(carrierId);
    if (carrierId === 'other') {
      setShippingCompany(customCompanyName);
      setOfficePhone('');
      setOfficeAddress('');
    } else {
      const carrier = carriers.find(c => c.id === carrierId);
      if (carrier) {
        setShippingCompany(carrier.name);
        setOfficePhone(carrier.phone || '');
        setOfficeAddress(carrier.address || '');
        if (carrier.origin_city) setOriginCity(carrier.origin_city);
        if (carrier.origin_hub) setOriginHub(carrier.origin_hub);
        if (carrier.destination_city) setDestinationCity(carrier.destination_city);
        if (carrier.destination_hub) setDestinationHub(carrier.destination_hub);
      }
    }
  };

  const handleCarrierAdded = (newCarrier: CarrierOption) => {
    setCarriers(prev => {
      const exists = prev.some(c => c.id === newCarrier.id || c.name === newCarrier.name);
      if (exists) return prev;
      return [newCarrier, ...prev];
    });
    setSelectedCarrierId(newCarrier.id);
    setShippingCompany(newCarrier.name);
    setOfficePhone(newCarrier.phone || '');
    setOfficeAddress(newCarrier.address || '');
    if (newCarrier.origin_city) setOriginCity(newCarrier.origin_city);
    if (newCarrier.origin_hub) setOriginHub(newCarrier.origin_hub);
    if (newCarrier.destination_city) setDestinationCity(newCarrier.destination_city);
    if (newCarrier.destination_hub) setDestinationHub(newCarrier.destination_hub);
    setShowAddCarrierModal(false);
    showToast(`تمت إضافة مكتب الشحن "${newCarrier.name}" بنجاح وحفظه في سوبابيز`, 'success');
  };

  // Save / Update Shipment
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.company_id || !user?.id) return;

    const finalCompanyName = shippingCompany === 'other' ? customCompanyName.trim() : shippingCompany;
    if (!finalCompanyName) {
      showToast('يرجى تحديد أو كتابة اسم مكتب أو شركة الشحن', 'error');
      return;
    }
    if (!waybillNumber.trim()) {
      showToast('يرجى إدخال رقم البوليصة / سند الشحن', 'error');
      return;
    }

    setSaving(true);
    try {
      const dto: UpsertShipmentDTO = {
        id: shipmentId,
        quotation_id: quotationId,
        route_code: routeCode,
        requesting_branch_id: requestingBranchId || null,
        destination_branch_id: destinationBranchId || null,
        shipping_company_name: finalCompanyName,
        shipping_office_phone: officePhone,
        shipping_office_address: officeAddress,
        waybill_number: waybillNumber.trim(),
        origin_city: originCity,
        origin_hub: originHub,
        destination_city: destinationCity,
        destination_hub: destinationHub,
        destination_warehouse_id: destinationWarehouseId || null,
        driver_name: driverName.trim(),
        driver_phone: driverPhone.trim(),
        vehicle_plate_number: vehiclePlateNumber.trim(),
        vehicle_type: vehicleType,
        parcel_count: Number(parcelCount) || 1,
        weight_kg: Number(weightKg) || 0,
        cargo_description: cargoDescription.trim(),
        shipping_cost: Number(shippingCost) || 0,
        shipping_currency: shippingCurrency,
        payment_method: paymentMethod,
        shipping_date: shippingDate,
        expected_arrival_date: expectedArrivalDate,
        tracking_status: trackingStatus,
        notes: notes.trim(),
      };

      const result = await shipmentsApi.upsertShipment(user.company_id, user.id, dto);
      setShipmentId(result.id);
      setTimeline(result.timeline);

      // إذا كانت الحالة اعتمدت أو شحنت، نتأكد من اعتماد العرض
      if (trackingStatus !== 'pending_dispatch') {
        await purchaseQuotationsApi.updateStatus(quotationId, 'accepted');
      }

      showToast('تم حفظ وتحديث بيانات الشحنة البرية بنجاح', 'success');
      onSuccess?.();
    } catch {
      showToast('حدث خطأ أثناء حفظ بيانات الشحنة', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Add Checkpoint Event to Timeline
  const handleAddCheckpoint = async () => {
    if (!user?.company_id || !user?.id || !shipmentId) {
      showToast('يرجى حفظ بيانات البوليصة أولاً قبل تسجيل المحطات', 'info');
      return;
    }
    const note = stationNote.trim() || `مرور الشحنة عبر محطة ${selectedStation}`;
    try {
      const updated = await shipmentsApi.updateTrackingStage(
        user.company_id,
        shipmentId,
        quotationId,
        trackingStatus,
        selectedStation,
        note,
        user.name || user.email
      );
      if (updated) {
        setTimeline(updated.timeline);
        setStationNote('');
        showToast(`تم تسجيل مرور الشحنة بمحطة ${selectedStation}`, 'success');
      }
    } catch {
      showToast('تعذر تسجيل المحطة', 'error');
    }
  };

  // Quick Step Change
  const handleStageChange = async (newStage: ShipmentTrackingStage) => {
    setTrackingStatus(newStage);
    if (!user?.company_id || !user?.id || !shipmentId) return;

    try {
      const stageLocation = newStage === 'arrived_at_office' || newStage === 'received_at_warehouse'
        ? destinationCity
        : originCity;

      const stageNote =
        newStage === 'arrived_at_office'
          ? 'وصلت الشحنة مكتب المهرة (الغيضة) وجاهزة للاستلام'
          : newStage === 'received_at_warehouse'
            ? 'تم استلام الطرود وفحصها في مستودع المهرة'
            : newStage === 'in_transit'
              ? 'انطلقت الشحنة على الخط البري الدولي بين المحافظات'
              : 'تحديث حالة الشحنة';

      const updated = await shipmentsApi.updateTrackingStage(
        user.company_id,
        shipmentId,
        quotationId,
        newStage,
        stageLocation,
        stageNote,
        user.name || user.email
      );
      if (updated) {
        setTimeline(updated.timeline);
        showToast('تم تحديث حالة الشحنة البرية بنجاح', 'success');
      }
    } catch {
      // Ignored
    }
  };

  // Build current shipment object for sharing
  const currentShipmentPreview: PurchaseQuotationShipment = {
    id: shipmentId || 'preview',
    company_id: user?.company_id || '',
    quotation_id: quotationId,
    quotation_number: quotationNumber,
    supplier_name: supplierName,
    route_code: routeCode,
    requesting_branch_id: requestingBranchId || undefined,
    requesting_branch: branches.find(b => b.id === requestingBranchId),
    destination_branch_id: destinationBranchId || undefined,
    destination_branch: branches.find(b => b.id === destinationBranchId),
    shipping_company_name: shippingCompany === 'other' ? customCompanyName : shippingCompany,
    shipping_office_phone: officePhone,
    shipping_office_address: officeAddress,
    waybill_number: waybillNumber,
    origin_city: originCity,
    origin_hub: originHub,
    destination_city: destinationCity,
    destination_hub: destinationHub,
    destination_warehouse_id: destinationWarehouseId,
    driver_name: driverName,
    driver_phone: driverPhone,
    vehicle_plate_number: vehiclePlateNumber,
    vehicle_type: vehicleType,
    parcel_count: parcelCount,
    weight_kg: weightKg,
    cargo_description: cargoDescription,
    shipping_cost: shippingCost,
    shipping_currency: shippingCurrency,
    payment_method: paymentMethod,
    shipping_date: shippingDate,
    expected_arrival_date: expectedArrivalDate,
    tracking_status: trackingStatus,
    timeline,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[var(--app-surface)] shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-transparent dark:from-blue-950/20 dark:via-indigo-950/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Truck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  تتبع الشحنة البرية (خط صنعاء ➔ المهرة)
                </h3>
                {quotationNumber && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-bold">
                    {quotationNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {supplierName ? `المورد: ${supplierName}` : 'متابعة بوليصة النقل وسندات شركات الشحن'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 py-3.5 bg-gray-50/70 dark:bg-slate-900/40 border-b border-gray-100 dark:border-slate-800">
          <ShipmentTrackingStepper
            currentStage={trackingStatus}
            interactive={true}
            originCity={originCity}
            onSelectStage={handleStageChange}
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-gray-100 dark:border-slate-800 bg-[var(--app-surface)]">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative ${
              activeTab === 'details'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            بيانات الشحنة والناقل
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative ${
              activeTab === 'timeline'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            خط السير والمحطات ({timeline.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('share')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative ${
              activeTab === 'share'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            مشاركة واتساب وإشعارات
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <span className="text-xs">جاري تحميل بيانات الشحنة وبوليصة النقل...</span>
            </div>
          ) : activeTab === 'details' ? (
            <form onSubmit={handleSave} className="space-y-5">
              {/* القسم 0: مسار الشحن البري والفروع المعنية */}
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-l from-indigo-50/40 via-white to-purple-50/30 p-4 dark:border-indigo-950/40 dark:bg-slate-900/50 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-300">
                    <Compass size={16} className="text-indigo-600 dark:text-indigo-400" />
                    <span>مسار الشحن البري وتحديد الفروع</span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold">
                    المقصد النهائي: المهرة (الغيضة / شحن)
                  </span>
                </div>

                {/* اختيار ممر ومسار الشحن */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                    اختر خط السير والممر البري *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {(Object.keys(SHIPPING_CORRIDORS) as ShippingCorridorCode[]).map(code => {
                      const c = SHIPPING_CORRIDORS[code];
                      const isSelected = routeCode === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => handleCorridorChange(code)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30'
                              : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Navigation size={13} className={isSelected ? 'text-white mb-0.5' : 'text-indigo-500 mb-0.5'} />
                          <span className="text-[10.5px] leading-tight font-bold">{c.originCity || 'مخصص'}</span>
                          <span className="text-[9.5px] opacity-80 mt-0.5">⟵ المهرة</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* تحديد الفروع: الفرع صاحب الطلب وفرع الوصول بالمهرة */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      الفرع صاحب الطلب / المستفيد *
                    </label>
                    <div className="relative">
                      <GitBranch size={15} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                      <select
                        value={requestingBranchId}
                        onChange={e => setRequestingBranchId(e.target.value)}
                        className="w-full text-xs rounded-lg border border-indigo-200 bg-white pr-9 pl-3 py-2 text-indigo-950 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-bold"
                      >
                        <option value="">-- اختر الفرع صاحب الطلب --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.is_main ? '(الفرع الرئيسي)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      فرع الاستلام والتوريد بالمهرة
                    </label>
                    <div className="relative">
                      <Building2 size={15} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                      <select
                        value={destinationBranchId}
                        onChange={e => {
                          setDestinationBranchId(e.target.value);
                          const branchWh = warehouses.find(w => w.branch_id === e.target.value);
                          if (branchWh) setDestinationWarehouseId(branchWh.id);
                        }}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white pr-9 pl-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                      >
                        <option value="">-- جميع فروع المهرة --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.is_main ? '(الرئيسي)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* القسم 1: شركة الشحن ورقم البوليصة */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/30 dark:bg-blue-950/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
                  <Building2 size={16} />
                  <span>شركة الشحن ومكتب الإرسالية</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300">
                        مكتب / شركة الشحن (من قاعدة البيانات) *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAddCarrierModal(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                        title="إضافة مكتب شحن جديد وحفظه في سوبابيز"
                      >
                        <Plus size={12} className="stroke-[2.5]" />
                        <span>مكتب جديد</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedCarrierId}
                        onChange={e => handleCarrierChange(e.target.value)}
                        className="flex-1 min-w-0 text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                      >
                        <option value="other">-- كتابة اسم مكتب / شركة شحن أخرى --</option>
                        {carriers.map(carrier => (
                          <option key={carrier.id} value={carrier.id}>
                            {carrier.name} {carrier.phone ? `(${carrier.phone})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddCarrierModal(true)}
                        title="إضافة مكتب أو شركة شحن جديدة وحفظها في قاعدة البيانات"
                        className="shrink-0 p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm cursor-pointer"
                      >
                        <Plus size={14} className="stroke-[2.5]" />
                      </button>
                    </div>
                  </div>

                  {selectedCarrierId === 'other' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        اسم مكتب النقل *
                      </label>
                      <input
                        type="text"
                        value={shippingCompany}
                        onChange={e => {
                          setShippingCompany(e.target.value);
                          setCustomCompanyName(e.target.value);
                        }}
                        placeholder="اكتب اسم المكتب / السائق..."
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        فرع {originCity || 'الانطلاق'} / نقطة الإرسال
                      </label>
                      <input
                        type="text"
                        value={originHub}
                        onChange={e => setOriginHub(e.target.value)}
                        placeholder={`مثال: فرع ${originCity} / المركز الرئيسي`}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      رقم البوليصة / سند الإرسالية *
                    </label>
                    <input
                      type="text"
                      value={waybillNumber}
                      onChange={e => setWaybillNumber(e.target.value)}
                      placeholder="مثال: BL-98402"
                      required
                      className="w-full text-xs font-mono font-bold rounded-lg border border-blue-300 bg-white p-2 text-blue-700 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      هاتف مكتب الشحن
                    </label>
                    <input
                      type="text"
                      value={officePhone}
                      onChange={e => setOfficePhone(e.target.value)}
                      placeholder="هاتف الاستفسار والمتابعة..."
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      مكتب الوصول بالمهرة
                    </label>
                    <input
                      type="text"
                      value={destinationHub}
                      onChange={e => setDestinationHub(e.target.value)}
                      placeholder="مثال: الغيضة - شارع المطار"
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* القسم 2: السائق ووسيلة النقل */}
              <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
                    <User size={16} className="text-indigo-600 dark:text-indigo-400" />
                    <span>بيانات السائق والشاحنة الناقلة (قاعدة البيانات)</span>
                  </div>
                  {drivers.length > 0 && (
                    <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
                      متوفر {drivers.length} سائق معتمد
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      اختيار سائق مسجل
                    </label>
                    <select
                      value={selectedDriverId}
                      onChange={e => handleDriverChange(e.target.value)}
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                    >
                      <option value="other">-- سائق آخر (إدخال يدوي) --</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.phone ? `(${d.phone})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      اسم السائق *
                    </label>
                    <input
                      type="text"
                      value={driverName}
                      onChange={e => {
                        setDriverName(e.target.value);
                        setSelectedDriverId('other');
                      }}
                      placeholder="اسم سائق الرحلة"
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      رقم هاتف السائق
                    </label>
                    <input
                      type="text"
                      value={driverPhone}
                      onChange={e => setDriverPhone(e.target.value)}
                      placeholder="770000000"
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-right"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      رقم اللوحة
                    </label>
                    <input
                      type="text"
                      value={vehiclePlateNumber}
                      onChange={e => setVehiclePlateNumber(e.target.value)}
                      placeholder="مثال: 12450 / نقل"
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      نوع المركبة
                    </label>
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="شاحنة نقل (دينا)">شاحنة نقل (دينا)</option>
                      <option value="هيلكس نقل">هيلكس نقل</option>
                      <option value="قاطرة / تريلا">قاطرة / تريلا</option>
                      <option value="شاحنة متوسطة">شاحنة متوسطة</option>
                      <option value="ونيت / شاص">ونيت / شاص</option>
                      <option value="باص نقل بضائع">باص نقل بضائع</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* القسم 3: تفاصيل الطرود وتكاليف الشحن والتوريد للمخزن */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* تفاصيل الطرود */}
                <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
                    <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
                    <span>الطرود ومستودع الاستلام</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        عدد الطرود (كرتون / طرد)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={parcelCount}
                        onChange={e => setParcelCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        الوزن التقريبي (كجم)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={weightKg}
                        onChange={e => setWeightKg(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      مستودع المهرة الوجهة *
                    </label>
                    <select
                      value={destinationWarehouseId}
                      onChange={e => setDestinationWarehouseId(e.target.value)}
                      className="w-full text-xs rounded-lg border border-emerald-300 bg-white p-2 text-emerald-800 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300 font-semibold"
                    >
                      <option value="">-- اختر مستودع الاستلام بالمهرة --</option>
                      {(destinationBranchId
                        ? warehouses.filter(w => !w.branch_id || w.branch_id === destinationBranchId)
                        : warehouses
                      ).map(wh => {
                        const whBranch = branches.find(b => b.id === wh.branch_id);
                        const branchLabel = whBranch?.name ? ` — ${whBranch.name}` : '';
                        return (
                          <option key={wh.id} value={wh.id}>
                            {wh.name_ar || wh.name || ''} {wh.is_primary ? '(الرئيسي)' : ''}{branchLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      وصف المحتويات والقطع
                    </label>
                    <input
                      type="text"
                      value={cargoDescription}
                      onChange={e => setCargoDescription(e.target.value)}
                      placeholder="مثال: فلاتر زيت وهواء، مساعدات، أقمشة فرامل"
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* أجور الشحن وطريقة الدفع والتواريخ */}
                <div className="rounded-xl border border-gray-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-slate-200">
                    <DollarSign size={16} className="text-amber-600 dark:text-amber-400" />
                    <span>أجور الشحن وتواريخ الرحلة</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        أجور الشحن
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={shippingCost}
                        onChange={e => setShippingCost(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        العملة
                      </label>
                      <select
                        value={shippingCurrency}
                        onChange={e => setShippingCurrency(e.target.value)}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-semibold"
                      >
                        <option value="YER">ريال يمني (YER)</option>
                        <option value="SAR">ريال سعودي (SAR)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      طريقة سداد أجور النقل
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as ShippingPaymentMethod)}
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="collect_on_delivery">دفع عند الاستلام في المهرة (COD)</option>
                      <option value="prepaid_by_supplier">مدفوع مقدماً من المورد في صنعاء</option>
                      <option value="on_company_account">مسجل على حساب المنشأة لدى مكتب الشحن</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        تاريخ تسليم المكتب
                      </label>
                      <input
                        type="date"
                        value={shippingDate}
                        onChange={e => setShippingDate(e.target.value)}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                        تاريخ الوصول المتوقع
                      </label>
                      <input
                        type="date"
                        value={expectedArrivalDate}
                        onChange={e => setExpectedArrivalDate(e.target.value)}
                        className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ملاحظات إضافية */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                  ملاحظات وتوجيهات خاصة بالشحنة
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="أي تعليمات خاصة بالاستلام أو فحص البضاعة أو متطلبات الفاتورة..."
                  className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </form>
          ) : activeTab === 'timeline' ? (
            /* تبويب خط السير والمحطات */
            <div className="space-y-6">
              {/* نموذج إضافة محطة جديدة */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
                  <MapPin size={16} />
                  <span>تسجيل مرور بمحطة أو نقطة على طريق {originCity} ⟵ المهرة</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      المحطة أو المدينة
                    </label>
                    <select
                      value={selectedStation}
                      onChange={e => setSelectedStation(e.target.value)}
                      className="w-full text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                    >
                      {transitStations.map((st: { id: string; name: string; province: string }) => (
                        <option key={st.id} value={st.name}>
                          {st.name} ({st.province})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">
                      ملاحظة المحطة (اختياري)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={stationNote}
                        onChange={e => setStationNote(e.target.value)}
                        placeholder="مثال: عبرت نقطة التفتيش بسلام بدون توقف"
                        className="flex-1 text-xs rounded-lg border border-gray-200 bg-white p-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCheckpoint}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs whitespace-nowrap transition-colors flex items-center gap-1.5"
                      >
                        <MapPin size={14} />
                        تسجيل النقطة
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* السجل الزمني */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-800 dark:text-slate-200">
                  السجل التتبعي الكامل للإرسالية:
                </h4>
                {timeline.length === 0 ? (
                  <div className="p-8 text-center border rounded-xl border-dashed border-gray-300 dark:border-slate-700 text-gray-400 text-xs">
                    لم يتم تسجيل أي محطات حتى الآن. احفظ الشحنة ثم أضف المحطات أثناء انتقالها.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200 dark:before:bg-blue-900/60">
                    {timeline.map((event: ShipmentTimelineEvent, idx: number) => (
                      <div key={event.id || idx} className="relative pr-6 group">
                        <div className="absolute right-1 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 dark:border-slate-900 shadow-sm" />
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-100 dark:border-slate-700 text-xs">
                          <div className="flex items-center justify-between font-bold text-gray-900 dark:text-white">
                            <span>{event.location}</span>
                            <span className="font-mono text-[10px] text-gray-400" dir="ltr">
                              {event.timestamp ? new Date(event.timestamp).toLocaleString('ar-YE') : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-gray-600 dark:text-slate-300 text-xs">
                            {event.note}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* تبويب مشاركة واتساب وإشعارات */
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 text-xs text-emerald-900 dark:text-emerald-300">
                <span className="font-bold">مشاركة بيانات الشحنة عبر واتساب:</span> يمكنك إرسال بطاقة الإرسالية بضغطة زر واحدة إلى السائق، أو مكتب الشحن، أو مسؤول المستودع في المهرة لمتابعة الاستلام.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. إرسال للسائق */}
                <button
                  type="button"
                  onClick={() => {
                    const msg = generateShipmentWhatsAppMessage(currentShipmentPreview, 'driver');
                    openWhatsAppShipmentShare(driverPhone, msg);
                  }}
                  className="p-4 rounded-xl border border-gray-200 bg-white hover:border-emerald-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-gray-900 dark:text-white">إرسال للسائق</span>
                    <Truck size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                    {driverPhone ? `إلى: ${driverPhone} (${driverName || 'سائق'})` : 'فتح واتساب لإدخال الرقم'}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Share2 size={13} /> مشاركة بوليصة السائق
                  </span>
                </button>

                {/* 2. إرسال لمكتب الشحن */}
                <button
                  type="button"
                  onClick={() => {
                    const msg = generateShipmentWhatsAppMessage(currentShipmentPreview, 'shipping_office');
                    openWhatsAppShipmentShare(officePhone, msg);
                  }}
                  className="p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-gray-900 dark:text-white">مكتب الشحن</span>
                    <Building2 size={18} className="text-blue-600" />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                    {officePhone ? `إلى: ${officePhone}` : 'متابعة بوليصة الشحن مع الفرع'}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                    <Share2 size={13} /> إرسال استفسار للمكتب
                  </span>
                </button>

                {/* 3. إرسال لمستودع المهرة */}
                <button
                  type="button"
                  onClick={() => {
                    const msg = generateShipmentWhatsAppMessage(currentShipmentPreview, 'warehouse_manager');
                    openWhatsAppShipmentShare('', msg);
                  }}
                  className="p-4 rounded-xl border border-gray-200 bg-white hover:border-purple-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-gray-900 dark:text-white">أمين مستودع المهرة</span>
                    <Warehouse size={18} className="text-purple-600" />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                    إشعار وصول واستلام وتجهيز فحص الطرود
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400">
                    <Share2 size={13} /> إشعار فريق المستودع
                  </span>
                </button>
              </div>

              {/* معاينة نص الرسالة */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <span className="text-xs font-bold text-gray-700 dark:text-slate-300 block mb-2">
                  معاينة نص الرسالة الجاهزة للإرسال:
                </span>
                <pre className="text-[11px] font-sans whitespace-pre-wrap text-gray-800 dark:text-slate-200 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                  {generateShipmentWhatsAppMessage(currentShipmentPreview, 'warehouse_manager')}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            {/* تحويل لمشتريات وتوريد المخزن عند الوصول */}
            {(trackingStatus === 'arrived_at_office' || trackingStatus === 'received_at_warehouse') && onConvertToPurchase && (
              <button
                type="button"
                onClick={() => {
                  onConvertToPurchase(quotationId);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all"
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
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 text-xs font-bold transition-colors"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ بيانات الشحنة
            </button>
          </div>
        </div>
      </div>

      {showAddCarrierModal && user?.company_id && (
        <AddCarrierModal
          isOpen={showAddCarrierModal}
          onClose={() => setShowAddCarrierModal(false)}
          onCarrierAdded={handleCarrierAdded}
          companyId={user.company_id}
        />
      )}
    </div>
  );
};

export default PurchaseShipmentModal;

