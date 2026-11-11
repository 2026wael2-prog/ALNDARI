/**
 * purchase_quotation_shipments types
 * تتبع وإدارة شحنات عروض الشراء البرية عبر مكاتب وشركات الشحن
 * مسارات الشحن المعتمدة إلى محافظة المهرة:
 * - صنعاء ⟵ المهرة
 * - عدن ⟵ المهرة
 * - تعز ⟵ المهرة
 * - المكلا ⟵ المهرة
 * - سيئون ⟵ المهرة
 */

export type ShipmentTrackingStage =
  | 'pending_dispatch'       // قيد التجهيز والتغليف لدى المورد
  | 'handed_to_office'       // سُلمت لمكتب الشحن مع سند الإرسالية
  | 'in_transit'             // على الطريق بين المحافظات
  | 'arrived_at_office'      // وصلت فرع مكتب الشحن بالمهرة (الغيضة / شحن)
  | 'received_at_warehouse'  // استُلمت وفُحصت في مستودع المنشأة بالمهرة
  | 'cancelled';             // ملغية / مرتجعة

export type ShippingPaymentMethod =
  | 'collect_on_delivery' // دفع عند الاستلام في المهرة (COD)
  | 'prepaid_by_supplier' // مدفوع مقدماً من المورد
  | 'on_company_account'; // مسجل على حساب المنشأة لدى مكتب الشحن

export type ShippingCorridorCode =
  | 'sanaa_mahrah'
  | 'aden_mahrah'
  | 'taiz_mahrah'
  | 'mukalla_mahrah'
  | 'seiyun_mahrah'
  | 'custom';

export interface TransitStation {
  id: string;
  name: string;
  province: string;
}

export interface ShippingCorridor {
  code: ShippingCorridorCode;
  label: string;
  originCity: string;
  destinationCity: string;
  defaultOriginHub: string;
  defaultTransitStations: TransitStation[];
}

export interface ShipmentTimelineEvent {
  id: string;
  stage: ShipmentTrackingStage;
  timestamp: string;
  location: string;
  note: string;
  updatedBy?: string | undefined;
}

export interface PurchaseQuotationShipment {
  id: string;
  company_id: string;
  quotation_id: string;
  quotation_number?: string | undefined;
  supplier_name?: string | undefined;

  // مسار الشحن والكود
  route_code?: ShippingCorridorCode | undefined;

  // ربط الفروع (الفرع صاحب الطلب وفرع الوصول بالمهرة)
  requesting_branch_id?: string | null | undefined;
  requesting_branch?: { id: string; name: string; code?: string | null | undefined } | null | undefined;
  destination_branch_id?: string | null | undefined;
  destination_branch?: { id: string; name: string; code?: string | null | undefined } | null | undefined;
  destination_warehouse_id?: string | null | undefined;

  // بيانات مكتب / شركة الشحن
  shipping_company_name: string;
  shipping_office_phone: string;
  shipping_office_address: string;
  waybill_number: string; // رقم البوليصة / سند الإرسالية

  // المسار الجغرافي
  origin_city: string;
  origin_hub?: string | undefined;
  destination_city: string;
  destination_hub?: string | undefined;

  // بيانات الناقل والسائق
  driver_name: string;
  driver_phone: string;
  vehicle_plate_number: string;
  vehicle_type: string; // دينا، قاطرة، شاحنة متوسطة، ونيت، هيلكس

  // تفاصيل الحمولة والطرود
  parcel_count: number;
  weight_kg: number;
  cargo_description: string;

  // التكاليف وأجور الشحن
  shipping_cost: number;
  shipping_currency: string; // YER أو SAR
  payment_method: ShippingPaymentMethod;

  // التواريخ
  shipping_date: string; // تاريخ التسليم لمكتب الشحن
  expected_arrival_date: string; // تاريخ الوصول المتوقع
  actual_arrival_date?: string | null | undefined;
  received_date?: string | null | undefined;
  received_by?: string | undefined;

  // الحالة ومسار التتبع
  tracking_status: ShipmentTrackingStage;
  timeline: ShipmentTimelineEvent[];
  notes?: string | undefined;

  created_at: string;
  updated_at: string;
  created_by?: string | undefined;
}

export interface UpsertShipmentDTO {
  id?: string | undefined;
  quotation_id: string;
  route_code?: ShippingCorridorCode | undefined;
  requesting_branch_id?: string | null | undefined;
  destination_branch_id?: string | null | undefined;
  destination_warehouse_id?: string | null | undefined;

  shipping_company_name: string;
  shipping_office_phone?: string | undefined;
  shipping_office_address?: string | undefined;
  waybill_number: string;

  origin_city?: string | undefined;
  origin_hub?: string | undefined;
  destination_city?: string | undefined;
  destination_hub?: string | undefined;

  driver_name?: string | undefined;
  driver_phone?: string | undefined;
  vehicle_plate_number?: string | undefined;
  vehicle_type?: string | undefined;

  parcel_count?: number | undefined;
  weight_kg?: number | undefined;
  cargo_description?: string | undefined;

  shipping_cost?: number | undefined;
  shipping_currency?: string | undefined;
  payment_method?: ShippingPaymentMethod | undefined;

  shipping_date?: string | undefined;
  expected_arrival_date?: string | undefined;
  actual_arrival_date?: string | null | undefined;
  received_date?: string | null | undefined;
  received_by?: string | undefined;

  tracking_status?: ShipmentTrackingStage | undefined;
  notes?: string | undefined;
  timelineEvent?: {
    stage: ShipmentTrackingStage;
    location: string;
    note: string;
  } | undefined;
}

/** بيانات مكتب أو ناقل الشحن المسجل في قاعدة البيانات */
export interface CarrierOption {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  origin_city?: string | null | undefined;
  origin_hub?: string | null | undefined;
  destination_city?: string | null | undefined;
  destination_hub?: string | null | undefined;
  source?: 'shipping_companies' | 'parties' | undefined;
}

/** بيانات السائقين المسجلين في النظام */
export interface DriverOption {
  id: string;
  name: string;
  phone: string | null;
}

/** نموذج إنشاء مكتب أو شركة شحن جديدة في سوبابيز */
export interface CreateCarrierDTO {
  name: string;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  origin_city?: string | null | undefined;
  origin_hub?: string | null | undefined;
  destination_city?: string | null | undefined;
  destination_hub?: string | null | undefined;
}

/** مسارات وممرات الشحن المعتمدة في اليمن المتجهة إلى المهرة */
export const SHIPPING_CORRIDORS: Record<ShippingCorridorCode, ShippingCorridor> = {
  sanaa_mahrah: {
    code: 'sanaa_mahrah',
    label: 'صنعاء ⟵ المهرة (الغيضة / شحن)',
    originCity: 'صنعاء',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: 'فرع مذبح / الحصبة / شارع خولان',
    defaultTransitStations: [
      { id: 'sanaa', name: 'صنعاء (نقطة الانطلاق)', province: 'أمانة العاصمة' },
      { id: 'marib', name: 'مأرب', province: 'مأرب' },
      { id: 'aber', name: 'العبر', province: 'حضرموت' },
      { id: 'seiyun', name: 'سيئون / تريم', province: 'وادي حضرموت' },
      { id: 'mukalla', name: 'المكلا / الشحر', province: 'ساحل حضرموت' },
      { id: 'sayhut', name: 'سيحوت / قشن', province: 'المهرة' },
      { id: 'alghaydah', name: 'الغيضة (عاصمة المهرة)', province: 'المهرة' },
      { id: 'shahan', name: 'منفذ شحن الحدودي', province: 'المهرة' },
      { id: 'hawf', name: 'محمية حوف', province: 'المهرة' },
    ],
  },
  aden_mahrah: {
    code: 'aden_mahrah',
    label: 'عدن ⟵ المهرة (الغيضة / شحن)',
    originCity: 'عدن',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: 'فرع الشيخ عثمان / دار سعد / البريقة',
    defaultTransitStations: [
      { id: 'aden', name: 'عدن (نقطة الانطلاق)', province: 'عدن' },
      { id: 'abyan_shaqra', name: 'أبين / شقرة', province: 'أبين' },
      { id: 'ahwar', name: 'أحور', province: 'أبين' },
      { id: 'shabwa_ataq', name: 'شبوة (عتق / بلحاف)', province: 'شبوة' },
      { id: 'mukalla', name: 'المكلا / بروم', province: 'حضرموت' },
      { id: 'shihr', name: 'الشحر / الحامي', province: 'حضرموت' },
      { id: 'sayhut', name: 'سيحوت / قشن', province: 'المهرة' },
      { id: 'alghaydah', name: 'الغيضة (عاصمة المهرة)', province: 'المهرة' },
      { id: 'shahan', name: 'منفذ شحن الحدودي', province: 'المهرة' },
    ],
  },
  taiz_mahrah: {
    code: 'taiz_mahrah',
    label: 'تعز ⟵ المهرة (الغيضة / شحن)',
    originCity: 'تعز',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: 'فرع الحوبان / مفرق ماوية / بير باشا',
    defaultTransitStations: [
      { id: 'taiz', name: 'تعز (الحوبان / المدينة)', province: 'تعز' },
      { id: 'lahj', name: 'لحج (العند / الحوطة)', province: 'لحج' },
      { id: 'aden', name: 'عدن (محطة عبور)', province: 'عدن' },
      { id: 'abyan', name: 'أبين / زنجبار', province: 'أبين' },
      { id: 'shabwah', name: 'شبوة (النقبة / عتق)', province: 'شبوة' },
      { id: 'mukalla', name: 'المكلا / ساحل حضرموت', province: 'حضرموت' },
      { id: 'sayhut', name: 'سيحوت / قشن', province: 'المهرة' },
      { id: 'alghaydah', name: 'الغيضة (عاصمة المهرة)', province: 'المهرة' },
      { id: 'shahan', name: 'منفذ شحن الحدودي', province: 'المهرة' },
    ],
  },
  mukalla_mahrah: {
    code: 'mukalla_mahrah',
    label: 'المكلا ⟵ المهرة (الغيضة / شحن)',
    originCity: 'المكلا',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: 'فرع جول مسحة / الديس / الشرج',
    defaultTransitStations: [
      { id: 'mukalla', name: 'المكلا (نقطة الانطلاق)', province: 'حضرموت' },
      { id: 'shihr', name: 'الشحر', province: 'حضرموت' },
      { id: 'hami', name: 'الحامي', province: 'حضرموت' },
      { id: 'dis_sharqia', name: 'الديس الشرقية', province: 'حضرموت' },
      { id: 'raida_qusaiar', name: 'الريدة وقصيعر / مصينعة', province: 'حضرموت' },
      { id: 'sayhut', name: 'سيحوت', province: 'المهرة' },
      { id: 'qishn', name: 'قشن', province: 'المهرة' },
      { id: 'alghaydah', name: 'الغيضة (عاصمة المهرة)', province: 'المهرة' },
      { id: 'shahan', name: 'منفذ شحن الحدودي', province: 'المهرة' },
    ],
  },
  seiyun_mahrah: {
    code: 'seiyun_mahrah',
    label: 'سيئون ⟵ المهرة (الغيضة / شحن)',
    originCity: 'سيئون',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: 'فرع وادي حضرموت / مريمة / تريم',
    defaultTransitStations: [
      { id: 'seiyun', name: 'سيئون (وادي حضرموت)', province: 'حضرموت' },
      { id: 'tarim', name: 'تريم', province: 'حضرموت' },
      { id: 'thamud', name: 'ثمود الصحراوي', province: 'حضرموت' },
      { id: 'ramah', name: 'رماه', province: 'حضرموت' },
      { id: 'shahan', name: 'منفذ شحن الحدودي', province: 'المهرة' },
      { id: 'alghaydah', name: 'الغيضة (عاصمة المهرة)', province: 'المهرة' },
      { id: 'hawf', name: 'محمية حوف', province: 'المهرة' },
    ],
  },
  custom: {
    code: 'custom',
    label: 'مسار مخصص آخر',
    originCity: '',
    destinationCity: 'المهرة (الغيضة)',
    defaultOriginHub: '',
    defaultTransitStations: [
      { id: 'start', name: 'نقطة الانطلاق', province: 'اليمن' },
      { id: 'transit', name: 'محطة عبور وسيطة', province: 'اليمن' },
      { id: 'dest', name: 'المهرة (الغيضة)', province: 'المهرة' },
    ],
  },
};

/** محطات خط صنعاء - المهرة للتوافقية العكسية */
export const SANA_MAHRAH_TRANSIT_STATIONS = SHIPPING_CORRIDORS.sanaa_mahrah.defaultTransitStations;
