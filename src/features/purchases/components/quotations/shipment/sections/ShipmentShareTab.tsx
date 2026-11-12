import React from 'react';
import { Truck, Building2, Warehouse, Share2 } from 'lucide-react';
import type { PurchaseQuotationShipment } from '@/features/purchases/types/shipment';
import {
  generateShipmentWhatsAppMessage,
  openWhatsAppShipmentShare,
} from '../ShipmentWhatsAppShare';

interface ShipmentShareTabProps {
  currentShipmentPreview: PurchaseQuotationShipment;
  driverPhone: string;
  driverName: string;
  officePhone: string;
}

export const ShipmentShareTab: React.FC<ShipmentShareTabProps> = ({
  currentShipmentPreview,
  driverPhone,
  driverName,
  officePhone,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 text-xs text-emerald-900 dark:text-emerald-300">
        <span className="font-bold">مشاركة بيانات الشحنة عبر واتساب:</span> يمكنك إرسال بطاقة
        الإرسالية بضغطة زر واحدة إلى السائق، أو مكتب الشحن، أو مسؤول المستودع في المهرة لمتابعة
        الاستلام.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. إرسال للسائق */}
        <button
          type="button"
          onClick={() => {
            const msg = generateShipmentWhatsAppMessage(currentShipmentPreview, 'driver');
            openWhatsAppShipmentShare(driverPhone, msg);
          }}
          className="p-4 rounded-xl border border-gray-200 bg-white hover:border-emerald-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between cursor-pointer"
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
          className="p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between cursor-pointer"
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
          className="p-4 rounded-xl border border-gray-200 bg-white hover:border-purple-500 hover:shadow-md transition-all text-right dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between cursor-pointer"
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
  );
};

