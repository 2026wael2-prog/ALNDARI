/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-misused-promises, max-lines-per-function */
import React, { useState } from 'react';
import {
  Building2,
  Loader2,
  MapPin,
  Phone,
  Save,
  Truck,
  X,
} from 'lucide-react';
import { shipmentsApi } from '../../../api/shipmentsApi';
import { useFeedbackStore } from '../../../../feedback/store';
import type { CarrierOption, CreateCarrierDTO } from '../../../types/shipment';

interface AddCarrierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCarrierAdded: (carrier: CarrierOption) => void;
  companyId: string;
}

export const AddCarrierModal: React.FC<AddCarrierModalProps> = ({
  isOpen,
  onClose,
  onCarrierAdded,
  companyId,
}) => {
  const { showToast } = useFeedbackStore();
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [originCity, setOriginCity] = useState('صنعاء');
  const [originHub, setOriginHub] = useState('');
  const [destinationCity, setDestinationCity] = useState('المهرة (الغيضة)');
  const [destinationHub, setDestinationHub] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('يرجى كتابة اسم مكتب أو شركة الشحن', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const dto: CreateCarrierDTO = {
        name: trimmedName,
        phone: phone.trim() ? phone.trim() : null,
        address: address.trim() ? address.trim() : null,
        origin_city: originCity.trim() ? originCity.trim() : 'صنعاء',
        origin_hub: originHub.trim() ? originHub.trim() : null,
        destination_city: destinationCity.trim() ? destinationCity.trim() : 'المهرة (الغيضة)',
        destination_hub: destinationHub.trim() ? destinationHub.trim() : null,
      };

      const newCarrier = await shipmentsApi.createCarrier(companyId, dto);
      onCarrierAdded(newCarrier);
    } catch {
      showToast('حدث خطأ أثناء حفظ مكتب الشحن، يرجى المحاولة ثانية', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800 bg-gradient-to-l from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                إضافة مكتب / شركة شحن بري جديدة
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                حفظ بيانات الناقل رسمياً في قاعدة البيانات لتسهيل التتبع والربط
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
            }}
            disabled={submitting}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
            {/* Carrier Name */}
            <div>
              <label
                htmlFor="carrier-name-input"
                className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1.5"
              >
                اسم مكتب النقل / شركة الشحن أو السائق <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Truck className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  id="carrier-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                  }}
                  placeholder="مثال: شركة الرويشان للنقليات / مكتب البراق"
                  className="w-full text-xs rounded-xl border border-gray-200 bg-white pr-9 pl-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="carrier-phone-input"
                  className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  رقم الهاتف / الواتساب
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    id="carrier-phone-input"
                    type="text"
                    value={phone}
                    onChange={e => {
                      setPhone(e.target.value);
                    }}
                    placeholder="مثال: 77XXXXXXX أو 01-XXXXXX"
                    dir="ltr"
                    className="w-full text-xs rounded-xl border border-gray-200 bg-white pr-9 pl-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-right transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="carrier-address-input"
                  className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  عنوان المقر أو الفرع الرئيسي
                </label>
                <div className="relative">
                  <MapPin className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    id="carrier-address-input"
                    type="text"
                    value={address}
                    onChange={e => {
                      setAddress(e.target.value);
                    }}
                    placeholder="مثال: شارع تعز / جولة الحصبة"
                    className="w-full text-xs rounded-xl border border-gray-200 bg-white pr-9 pl-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Route & Hub Defaults */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 block">
                مراكز ومسارات الشحن المعتادة (صنعاء، عدن، تعز، المكلا، سيئون ⟵ المهرة)
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="carrier-origin-city-input"
                    className="block text-[11px] font-medium text-gray-600 dark:text-slate-400 mb-1"
                  >
                    مدينة الانطلاق
                  </label>
                  <select
                    id="carrier-origin-city-input"
                    value={originCity}
                    onChange={e => {
                      setOriginCity(e.target.value);
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                  >
                    <option value="صنعاء">صنعاء</option>
                    <option value="عدن">عدن</option>
                    <option value="تعز">تعز</option>
                    <option value="المكلا">المكلا</option>
                    <option value="سيئون">سيئون</option>
                    <option value="مأرب">مأرب</option>
                    <option value="عتق">عتق (شبوة)</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="carrier-origin-hub-input"
                    className="block text-[11px] font-medium text-gray-600 dark:text-slate-400 mb-1"
                  >
                    نقطة / فرع الاستلام بمدينة الانطلاق
                  </label>
                  <input
                    id="carrier-origin-hub-input"
                    type="text"
                    value={originHub}
                    onChange={e => {
                      setOriginHub(e.target.value);
                    }}
                    placeholder="مثال: الفرع الرئيسي / المستودع"
                    className="w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="carrier-dest-city-input"
                    className="block text-[11px] font-medium text-gray-600 dark:text-slate-400 mb-1"
                  >
                    مدينة الوصول
                  </label>
                  <input
                    id="carrier-dest-city-input"
                    type="text"
                    value={destinationCity}
                    onChange={e => {
                      setDestinationCity(e.target.value);
                    }}
                    className="w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="carrier-dest-hub-input"
                    className="block text-[11px] font-medium text-gray-600 dark:text-slate-400 mb-1"
                  >
                    فرع الوصول بالمهرة
                  </label>
                  <input
                    id="carrier-dest-hub-input"
                    type="text"
                    value={destinationHub}
                    onChange={e => {
                      setDestinationHub(e.target.value);
                    }}
                    placeholder="مثال: فرع الغيضة (شارع المطار) / شحن"
                    className="w-full text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري الحفظ في سوبابيز...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>حفظ واعتماد المكتب</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
