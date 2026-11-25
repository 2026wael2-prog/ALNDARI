import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { shipmentsApi } from '@/features/purchases/api/shipmentsApi';
import { purchaseQuotationsApi } from '@/features/purchases/api/quotationsApi';
import { useAuthStore } from '@/features/auth/store';
import { useFeedbackStore } from '@/features/feedback/store';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useBranches } from '@/features/settings/hooks';
import {
  SHIPPING_CORRIDORS,
  type CarrierOption,
  type DriverOption,
  type ShipmentTimelineEvent,
  type ShipmentTrackingStage,
  type ShippingCorridorCode,
  type TransitStation,
} from '@/features/purchases/types/shipment';
import {
  applyCarrierToFields,
  buildShipmentPreview,
  buildUpsertShipmentDTO,
  createInitialShipmentFields,
  hydrateShipmentState,
  resolveStageChangeMeta,
  type ShipmentFormFields,
} from './shipmentFormHelpers';

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

  const [fields, setFields] = useState<ShipmentFormFields>(createInitialShipmentFields);
  const [transitStations, setTransitStations] = useState<TransitStation[]>(
    SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations
  );

  // مكاتب وشركات النقل والسائقون من سوبابيز
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('other');
  const [showAddCarrierModal, setShowAddCarrierModal] = useState(false);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('other');

  const [shipmentId, setShipmentId] = useState<string | undefined>(undefined);
  const [timeline, setTimeline] = useState<ShipmentTimelineEvent[]>([]);
  const [selectedStation, setSelectedStation] = useState(
    SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations[0].name
  );
  const [stationNote, setStationNote] = useState('');

  const createFieldSetter = useCallback(
    <K extends keyof ShipmentFormFields>(key: K) =>
      (valueOrUpdater: SetStateAction<ShipmentFormFields[K]>) => {
        setFields(prev => ({
          ...prev,
          [key]:
            typeof valueOrUpdater === 'function'
              ? (valueOrUpdater as (curr: ShipmentFormFields[K]) => ShipmentFormFields[K])(prev[key])
              : valueOrUpdater,
        }));
      },
    []
  );

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

        if (!isMounted) return;
        setCarriers(realCarriers);
        setDrivers(realDrivers);

        if (existing) {
          const hydrated = hydrateShipmentState(existing, realCarriers, realDrivers, user.branch_id);
          setShipmentId(hydrated.shipmentId);
          setSelectedCarrierId(hydrated.selectedCarrierId);
          setSelectedDriverId(hydrated.selectedDriverId);
          setTransitStations(hydrated.transitStations);
          setSelectedStation(hydrated.selectedStation);
          setTimeline(hydrated.timeline);
          setFields(hydrated.fields);
        } else {
          setFields(prev => {
            const next = { ...prev };
            if (user.branch_id) next.requestingBranchId = user.branch_id;
            if (warehouses.length > 0 && !prev.destinationWarehouseId) {
              const primaryWh = warehouses.find(w => Boolean(w.is_primary));
              next.destinationWarehouseId = primaryWh ? primaryWh.id : warehouses[0].id;
              if (primaryWh?.branch_id) next.destinationBranchId = primaryWh.branch_id;
            }
            return next;
          });
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

  const handleCorridorChange = (newCode: ShippingCorridorCode) => {
    const corridor = SHIPPING_CORRIDORS[newCode];
    setFields(prev => ({
      ...prev,
      routeCode: newCode,
      ...(corridor && newCode !== 'custom'
        ? {
            originCity: corridor.originCity,
            originHub: corridor.defaultOriginHub,
            destinationCity: corridor.destinationCity,
          }
        : {}),
    }));
    if (corridor) {
      setTransitStations(corridor.defaultTransitStations);
      if (corridor.defaultTransitStations.length > 0) {
        setSelectedStation(corridor.defaultTransitStations[0].name);
      }
    }
  };

  const handleDriverChange = (driverId: string) => {
    setSelectedDriverId(driverId);
    if (driverId !== 'other') {
      const driver = drivers.find(d => d.id === driverId);
      if (driver) {
        setFields(prev => ({ ...prev, driverName: driver.name, driverPhone: driver.phone || '' }));
      }
    }
  };

  const handleCarrierChange = (carrierId: string) => {
    setSelectedCarrierId(carrierId);
    if (carrierId === 'other') {
      setFields(prev => ({
        ...prev,
        shippingCompany: prev.customCompanyName,
        officePhone: '',
        officeAddress: '',
      }));
      return;
    }
    const carrier = carriers.find(c => c.id === carrierId);
    if (carrier) {
      setFields(prev => applyCarrierToFields(prev, carrier));
    }
  };

  const handleCarrierAdded = (newCarrier: CarrierOption) => {
    setCarriers(prev => {
      const exists = prev.some(c => c.id === newCarrier.id || c.name === newCarrier.name);
      return exists ? prev : [newCarrier, ...prev];
    });
    setSelectedCarrierId(newCarrier.id);
    setFields(prev => applyCarrierToFields(prev, newCarrier));
    setShowAddCarrierModal(false);
    showToast(`تمت إضافة مكتب الشحن "${newCarrier.name}" بنجاح وحفظه في سوبابيز`, 'success');
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.company_id || !user?.id) return;

    const finalCompanyName =
      fields.shippingCompany === 'other' ? fields.customCompanyName.trim() : fields.shippingCompany;
    if (!finalCompanyName) {
      showToast('يرجى تحديد أو كتابة اسم مكتب أو شركة الشحن', 'error');
      return;
    }
    if (!fields.waybillNumber.trim()) {
      showToast('يرجى إدخال رقم البوليصة / سند الشحن', 'error');
      return;
    }

    setSaving(true);
    try {
      const dto = buildUpsertShipmentDTO(shipmentId, quotationId, finalCompanyName, fields);
      const result = await shipmentsApi.upsertShipment(user.company_id, user.id, dto);
      setShipmentId(result.id);
      setTimeline(result.timeline);

      if (fields.trackingStatus !== 'pending_dispatch') {
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
        fields.trackingStatus,
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

  const handleStageChange = async (newStage: ShipmentTrackingStage) => {
    setFields(prev => ({ ...prev, trackingStatus: newStage }));
    if (!user?.company_id || !user?.id || !shipmentId) return;

    try {
      const { stageLocation, stageNote } = resolveStageChangeMeta(
        newStage,
        fields.originCity,
        fields.destinationCity
      );
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

  const currentShipmentPreview = buildShipmentPreview({
    shipmentId,
    companyId: user?.company_id || '',
    quotationId,
    quotationNumber,
    supplierName,
    branches,
    fields,
    timeline,
  });

  return {
    user,
    branches,
    warehouses,
    loading,
    saving,
    activeTab,
    setActiveTab,
    routeCode: fields.routeCode,
    transitStations,
    requestingBranchId: fields.requestingBranchId,
    setRequestingBranchId: createFieldSetter('requestingBranchId'),
    destinationBranchId: fields.destinationBranchId,
    setDestinationBranchId: createFieldSetter('destinationBranchId'),
    carriers,
    selectedCarrierId,
    showAddCarrierModal,
    setShowAddCarrierModal,
    drivers,
    selectedDriverId,
    shipmentId,
    shippingCompany: fields.shippingCompany,
    setShippingCompany: createFieldSetter('shippingCompany'),
    customCompanyName: fields.customCompanyName,
    setCustomCompanyName: createFieldSetter('customCompanyName'),
    officePhone: fields.officePhone,
    setOfficePhone: createFieldSetter('officePhone'),
    officeAddress: fields.officeAddress,
    setOfficeAddress: createFieldSetter('officeAddress'),
    waybillNumber: fields.waybillNumber,
    setWaybillNumber: createFieldSetter('waybillNumber'),
    originCity: fields.originCity,
    setOriginCity: createFieldSetter('originCity'),
    originHub: fields.originHub,
    setOriginHub: createFieldSetter('originHub'),
    destinationCity: fields.destinationCity,
    setDestinationCity: createFieldSetter('destinationCity'),
    destinationHub: fields.destinationHub,
    setDestinationHub: createFieldSetter('destinationHub'),
    destinationWarehouseId: fields.destinationWarehouseId,
    setDestinationWarehouseId: createFieldSetter('destinationWarehouseId'),
    driverName: fields.driverName,
    setDriverName: createFieldSetter('driverName'),
    driverPhone: fields.driverPhone,
    setDriverPhone: createFieldSetter('driverPhone'),
    vehiclePlateNumber: fields.vehiclePlateNumber,
    setVehiclePlateNumber: createFieldSetter('vehiclePlateNumber'),
    vehicleType: fields.vehicleType,
    setVehicleType: createFieldSetter('vehicleType'),
    parcelCount: fields.parcelCount,
    setParcelCount: createFieldSetter('parcelCount'),
    weightKg: fields.weightKg,
    setWeightKg: createFieldSetter('weightKg'),
    cargoDescription: fields.cargoDescription,
    setCargoDescription: createFieldSetter('cargoDescription'),
    shippingCost: fields.shippingCost,
    setShippingCost: createFieldSetter('shippingCost'),
    shippingCurrency: fields.shippingCurrency,
    setShippingCurrency: createFieldSetter('shippingCurrency'),
    paymentMethod: fields.paymentMethod,
    setPaymentMethod: createFieldSetter('paymentMethod'),
    shippingDate: fields.shippingDate,
    setShippingDate: createFieldSetter('shippingDate'),
    expectedArrivalDate: fields.expectedArrivalDate,
    setExpectedArrivalDate: createFieldSetter('expectedArrivalDate'),
    trackingStatus: fields.trackingStatus,
    setTrackingStatus: createFieldSetter('trackingStatus'),
    notes: fields.notes,
    setNotes: createFieldSetter('notes'),
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
