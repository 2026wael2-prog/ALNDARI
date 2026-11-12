import { useEffect, useState } from 'react';
import { shipmentsApi } from '@/features/purchases/api/shipmentsApi';
import { purchaseQuotationsApi } from '@/features/purchases/api/quotationsApi';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useBranches } from '@/features/settings/hooks';
import { formatLocalDate } from '@/core/utils/dateUtils';
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
} from '@/features/purchases/types/shipment';

export interface UseShipmentFormProps {
  quotationId: string;
  quotationNumber?: string | undefined;
  supplierName?: string | undefined;
  onSuccess?: (() => void) | undefined;
}

export function useShipmentForm({
  quotationId,
  quotationNumber,
  supplierName,
  onSuccess,
}: UseShipmentFormProps) {
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
  const [transitStations, setTransitStations] = useState<TransitStation[]>(
    SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations
  );

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
  const [timeline, setTimeline] = useState<ShipmentTimelineEvent[]>([]);

  // New Checkpoint Station Input
  const [selectedStation, setSelectedStation] = useState(
    SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations[0].name
  );
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
            const matchedCarrier = realCarriers.find((c: CarrierOption) => c.name === existing.shipping_company_name);
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
              (d: DriverOption) => d.name === existing.driver_name || (d.phone !== null && d.phone !== undefined && d.phone === existing.driver_phone)
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

    const finalCompanyName =
      shippingCompany === 'other' ? customCompanyName.trim() : shippingCompany;
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
      const stageLocation =
        newStage === 'arrived_at_office' || newStage === 'received_at_warehouse'
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
    notes,
    timeline,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    user,
    branches,
    warehouses,
    loading,
    saving,
    activeTab,
    setActiveTab,
    routeCode,
    transitStations,
    requestingBranchId,
    setRequestingBranchId,
    destinationBranchId,
    setDestinationBranchId,
    carriers,
    selectedCarrierId,
    showAddCarrierModal,
    setShowAddCarrierModal,
    drivers,
    selectedDriverId,
    shipmentId,
    shippingCompany,
    setShippingCompany,
    customCompanyName,
    setCustomCompanyName,
    officePhone,
    setOfficePhone,
    officeAddress,
    setOfficeAddress,
    waybillNumber,
    setWaybillNumber,
    originCity,
    setOriginCity,
    originHub,
    setOriginHub,
    destinationCity,
    setDestinationCity,
    destinationHub,
    setDestinationHub,
    destinationWarehouseId,
    setDestinationWarehouseId,
    driverName,
    setDriverName,
    driverPhone,
    setDriverPhone,
    vehiclePlateNumber,
    setVehiclePlateNumber,
    vehicleType,
    setVehicleType,
    parcelCount,
    setParcelCount,
    weightKg,
    setWeightKg,
    cargoDescription,
    setCargoDescription,
    shippingCost,
    setShippingCost,
    shippingCurrency,
    setShippingCurrency,
    paymentMethod,
    setPaymentMethod,
    shippingDate,
    setShippingDate,
    expectedArrivalDate,
    setExpectedArrivalDate,
    trackingStatus,
    setTrackingStatus,
    notes,
    setNotes,
    timeline,
    selectedStation,
    setSelectedStation,
    stationNote,
    setStationNote,
    handleCorridorChange,
    handleDriverChange,
    handleCarrierChange,
    handleCarrierAdded,
    handleSave,
    handleAddCheckpoint,
    handleStageChange,
    currentShipmentPreview,
  };
}

