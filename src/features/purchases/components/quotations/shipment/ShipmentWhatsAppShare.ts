/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/strict-boolean-expressions, complexity, max-lines-per-function */
import type { PurchaseQuotationShipment } from '../../../types/shipment';

/**
 * توليد رسالة واتساب رسمية ومفصلة لبيانات بوليصة الشحن وتتبع الإرسالية
 * (خط سير صنعاء ➔ المهرة)
 */
export const generateShipmentWhatsAppMessage = (
  shipment: PurchaseQuotationShipment,
  targetRecipient: 'driver' | 'shipping_office' | 'warehouse_manager' | 'supplier'
): string => {
  const line = '━━━━━━━━━━━━━━━━━━━━';
  const stageLabels: Record<string, string> = {
    pending_dispatch: 'قيد التجهيز والتغليف لدى مورد صنعاء',
    handed_to_office: 'تم تسليمها لمكتب الشحن بصنعاء',
    in_transit: 'على الطريق البري (صنعاء ➔ المهرة)',
    arrived_at_office: 'وصلت فرع مكتب الشحن بالمهرة',
    received_at_warehouse: 'تم استلامها وفحصها في مستودع المهرة',
    cancelled: 'ملغية / مرتجعة',
  };

  const paymentLabels: Record<string, string> = {
    collect_on_delivery: 'دفع عند الاستلام بالمهرة (COD)',
    prepaid_by_supplier: 'مدفوع مقدماً من المورد بصنعاء',
    on_company_account: 'مقيد على حساب المنشأة بالمكتب',
  };

  let title = '📦 *إشعار شحنة بضاعة وقطع غيار*';
  if (targetRecipient === 'driver') {
    title = '🚚 *بيانات إرسالية النقل البري — للسائق*';
  } else if (targetRecipient === 'warehouse_manager') {
    title = '🏢 *إشعار وصول واستلام بضاعة لمستودع المهرة*';
  } else if (targetRecipient === 'shipping_office') {
    title = '📋 *متابعة بوليصة شحن بري لدى المكتب*';
  }

  const parts = [
    title,
    line,
    `🔖 *رقم البوليصة / السند:* \`${shipment.waybill_number}\``,
    shipment.quotation_number ? `📄 *رقم عرض الشراء:* \`${shipment.quotation_number}\`` : '',
    shipment.requesting_branch?.name ? `🏬 *الفرع صاحب الطلب:* ${shipment.requesting_branch.name}` : '',
    shipment.supplier_name ? `🏭 *المورد:* ${shipment.supplier_name} (${shipment.origin_city})` : '',
    line,
    `🏢 *مكتب / شركة الشحن:* ${shipment.shipping_company_name}`,
    shipment.origin_hub ? `📍 *نقطة الانطلاق:* ${shipment.origin_city} (${shipment.origin_hub})` : `📍 *نقطة الانطلاق:* ${shipment.origin_city}`,
    shipment.destination_hub ? `🏁 *وجهة الوصول:* ${shipment.destination_city} (${shipment.destination_hub})` : `🏁 *وجهة الوصول:* ${shipment.destination_city}`,
    line,
    `📦 *عدد الطرود:* ${shipment.parcel_count} طرد`,
    shipment.weight_kg > 0 ? `⚖️ *الوزن الإجمالي:* ${shipment.weight_kg} كجم` : '',
    shipment.cargo_description ? `📝 *نوع المحتويات:* ${shipment.cargo_description}` : '',
    line,
    shipment.driver_name ? `👤 *اسم السائق:* ${shipment.driver_name}` : '',
    shipment.driver_phone ? `📱 *هاتف السائق:* ${shipment.driver_phone}` : '',
    shipment.vehicle_plate_number ? `🚛 *رقم اللوحة والمركبة:* ${shipment.vehicle_plate_number} (${shipment.vehicle_type})` : '',
    line,
    `💰 *أجور الشحن:* ${shipment.shipping_cost.toLocaleString('en-US')} ${shipment.shipping_currency}`,
    `💳 *طريقة الدفع:* ${paymentLabels[shipment.payment_method] || shipment.payment_method}`,
    `📅 *تاريخ الإرسال:* ${shipment.shipping_date}`,
    `⏳ *تاريخ الوصول المتوقع:* ${shipment.expected_arrival_date}`,
    `🚦 *الحالة الحالية:* ${stageLabels[shipment.tracking_status] || shipment.tracking_status}`,
    line,
    'محلات النظاري لقطع غيار السيارات — المهرة',
  ];

  return parts.filter(Boolean).join('\n');
};

/**
 * فتح رابط واتساب مباشرة بالرسالة المنسقة
 */
export const openWhatsAppShipmentShare = (
  phone: string,
  message: string
): void => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(message);
  const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

