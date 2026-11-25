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

export interface ShipmentFormFields {
  routeCode: ShippingCorridorCode;
  requestingBranchId: string;
  destinationBranchId: string;
  shippingCompany: string;
  customCompanyName: string;
  officePhone: string;
  officeAddress: string;
  waybillNumber: string;
  originCity: string;
  originHub: string;
  destinationCity: string;
  destinationHub: string;
  destinationWarehouseId: string;
  driverName: string;
  driverPhone: string;
  vehiclePlateNumber: string;
  vehicleType: string;
  parcelCount: number;
  weightKg: number;
  cargoDescription: string;
  shippingCost: number;
  shippingCurrency: string;
  paymentMethod: ShippingPaymentMethod;
  shippingDate: string;
  expectedArrivalDate: string;
  trackingStatus: ShipmentTrackingStage;
  notes: string;
}

export function createInitialShipmentFields(): ShipmentFormFields {
  const today = formatLocalDate(new Date());
  return {
    routeCode: 'sanaa_mahrah',
    requestingBranchId: '',
    destinationBranchId: '',
    shippingCompany: '',
    customCompanyName: '',
    officePhone: '',
    officeAddress: '',
    waybillNumber: '',
    originCity: 'صنعاء',
    originHub: '',
    destinationCity: 'المهرة (الغيضة)',
    destinationHub: '',
    destinationWarehouseId: '',
    driverName: '',
    driverPhone: '',
    vehiclePlateNumber: '',
    vehicleType: 'شاحنة نقل (دينا)',
    parcelCount: 1,
    weightKg: 0,
    cargoDescription: 'قطع غيار سيارات',
    shippingCost: 0,
    shippingCurrency: 'YER',
    paymentMethod: 'collect_on_delivery',
    shippingDate: today,
    expectedArrivalDate: today,
    trackingStatus: 'handed_to_office',
    notes: '',
  };
}

export interface HydratedShipmentResult {
  shipmentId: string;
  fields: ShipmentFormFields;
  selectedCarrierId: string;
  selectedDriverId: string;
  transitStations: TransitStation[];
  selectedStation: string;
  timeline: ShipmentTimelineEvent[];
}

export function hydrateShipmentState(
  existing: PurchaseQuotationShipment,
  realCarriers: CarrierOption[],
  realDrivers: DriverOption[],
  userBranchId?: string | null
): HydratedShipmentResult {
  const matchedCarrier = realCarriers.find(
    (c: CarrierOption) => c.name === existing.shipping_company_name
  );
  const matchedDriver = realDrivers.find(
    (d: DriverOption) =>
      d.name === existing.driver_name ||
      (d.phone !== null && d.phone !== undefined && d.phone === existing.driver_phone)
  );

  const corridor: ShippingCorridorCode = existing.route_code ?? 'sanaa_mahrah';
  const activeCorridor = SHIPPING_CORRIDORS[corridor] || SHIPPING_CORRIDORS.sanaa_mahrah;

  return {
    shipmentId: existing.id,
    selectedCarrierId: matchedCarrier ? matchedCarrier.id : 'other',
    selectedDriverId: matchedDriver ? matchedDriver.id : 'other',
    transitStations: activeCorridor.defaultTransitStations,
    selectedStation: activeCorridor.defaultTransitStations[0]?.name || 'صنعاء',
    timeline: existing.timeline || [],
    fields: {
      routeCode: corridor,
      requestingBranchId: existing.requesting_branch_id || userBranchId || '',
      destinationBranchId: existing.destination_branch_id || '',
      shippingCompany: existing.shipping_company_name,
      customCompanyName: matchedCarrier ? '' : existing.shipping_company_name,
      officePhone: existing.shipping_office_phone,
      officeAddress: existing.shipping_office_address,
      waybillNumber: existing.waybill_number,
      originCity: existing.origin_city,
      originHub: existing.origin_hub || '',
      destinationCity: existing.destination_city,
      destinationHub: existing.destination_hub || '',
      destinationWarehouseId: existing.destination_warehouse_id || '',
      driverName: existing.driver_name,
      driverPhone: existing.driver_phone,
      vehiclePlateNumber: existing.vehicle_plate_number,
      vehicleType: existing.vehicle_type,
      parcelCount: existing.parcel_count,
      weightKg: existing.weight_kg,
      cargoDescription: existing.cargo_description,
      shippingCost: existing.shipping_cost,
      shippingCurrency: existing.shipping_currency,
      paymentMethod: existing.payment_method,
      shippingDate: existing.shipping_date,
      expectedArrivalDate: existing.expected_arrival_date,
      trackingStatus: existing.tracking_status,
      notes: existing.notes || '',
    },
  };
}

export function applyCarrierToFields(
  prev: ShipmentFormFields,
  carrier: CarrierOption
): ShipmentFormFields {
  return {
    ...prev,
    shippingCompany: carrier.name,
    officePhone: carrier.phone || '',
    officeAddress: carrier.address || '',
    originCity: carrier.origin_city || prev.originCity,
    originHub: carrier.origin_hub || prev.originHub,
    destinationCity: carrier.destination_city || prev.destinationCity,
    destinationHub: carrier.destination_hub || prev.destinationHub,
  };
}

export function buildUpsertShipmentDTO(
  shipmentId: string | undefined,
  quotationId: string,
  finalCompanyName: string,
  fields: ShipmentFormFields
): UpsertShipmentDTO {
  return {
    id: shipmentId,
    quotation_id: quotationId,
    route_code: fields.routeCode,
    requesting_branch_id: fields.requestingBranchId || null,
    destination_branch_id: fields.destinationBranchId || null,
    shipping_company_name: finalCompanyName,
    shipping_office_phone: fields.officePhone,
    shipping_office_address: fields.officeAddress,
    waybill_number: fields.waybillNumber.trim(),
    origin_city: fields.originCity,
    origin_hub: fields.originHub,
    destination_city: fields.destinationCity,
    destination_hub: fields.destinationHub,
    destination_warehouse_id: fields.destinationWarehouseId || null,
    driver_name: fields.driverName.trim(),
    driver_phone: fields.driverPhone.trim(),
    vehicle_plate_number: fields.vehiclePlateNumber.trim(),
    vehicle_type: fields.vehicleType,
    parcel_count: Number(fields.parcelCount) || 1,
    weight_kg: Number(fields.weightKg) || 0,
    cargo_description: fields.cargoDescription.trim(),
    shipping_cost: Number(fields.shippingCost) || 0,
    shipping_currency: fields.shippingCurrency,
    payment_method: fields.paymentMethod,
    shipping_date: fields.shippingDate,
    expected_arrival_date: fields.expectedArrivalDate,
    tracking_status: fields.trackingStatus,
    notes: fields.notes.trim(),
  };
}

export function resolveStageChangeMeta(
  newStage: ShipmentTrackingStage,
  originCity: string,
  destinationCity: string
): { stageLocation: string; stageNote: string } {
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

  return { stageLocation, stageNote };
}

export function buildShipmentPreview<TBranch extends { id: string }>(params: {
  shipmentId: string | undefined;
  companyId: string;
  quotationId: string;
  quotationNumber?: string | undefined;
  supplierName?: string | undefined;
  branches: TBranch[];
  fields: ShipmentFormFields;
  timeline: ShipmentTimelineEvent[];
}): PurchaseQuotationShipment {
  const { shipmentId, companyId, quotationId, quotationNumber, supplierName, branches, fields, timeline } =
    params;
  const nowIso = new Date().toISOString();

  return {
    id: shipmentId || 'preview',
    company_id: companyId,
    quotation_id: quotationId,
    quotation_number: quotationNumber,
    supplier_name: supplierName,
    route_code: fields.routeCode,
    requesting_branch_id: fields.requestingBranchId || undefined,
    requesting_branch: branches.find(b => b.id === fields.requestingBranchId) as PurchaseQuotationShipment['requesting_branch'],
    destination_branch_id: fields.destinationBranchId || undefined,
    destination_branch: branches.find(b => b.id === fields.destinationBranchId) as PurchaseQuotationShipment['destination_branch'],
    shipping_company_name:
      fields.shippingCompany === 'other' ? fields.customCompanyName : fields.shippingCompany,
    shipping_office_phone: fields.officePhone,
    shipping_office_address: fields.officeAddress,
    waybill_number: fields.waybillNumber,
    origin_city: fields.originCity,
    origin_hub: fields.originHub,
    destination_city: fields.destinationCity,
    destination_hub: fields.destinationHub,
    destination_warehouse_id: fields.destinationWarehouseId,
    driver_name: fields.driverName,
    driver_phone: fields.driverPhone,
    vehicle_plate_number: fields.vehiclePlateNumber,
    vehicle_type: fields.vehicleType,
    parcel_count: fields.parcelCount,
    weight_kg: fields.weightKg,
    cargo_description: fields.cargoDescription,
    shipping_cost: fields.shippingCost,
    shipping_currency: fields.shippingCurrency,
    payment_method: fields.paymentMethod,
    shipping_date: fields.shippingDate,
    expected_arrival_date: fields.expectedArrivalDate,
    tracking_status: fields.trackingStatus,
    notes: fields.notes,
    timeline,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
