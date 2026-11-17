import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Image as ImageIcon, MessageCircle, Send } from 'lucide-react';
import Modal from '../../../../ui/base/Modal';
import Button from '../../../../ui/base/Button';
import { useAuthStore } from '../../../auth/store';
import { useFeedbackStore } from '../../../feedback/store';
import { shareService } from '../../../notifications/shareService';
import { buildWhatsAppLink, hasValidWhatsAppPhone } from '../../../../core/utils/whatsapp';
import type { IntelligenceEngineOutput } from '../../types';
import {
  exportExecutiveStudyExcel,
  exportExecutiveStudyExcelBase64,
} from '../../utils/intelligenceExcelExporter';
import {
  buildExecutiveDigestMessage,
  type DigestScope,
} from '../../utils/intelligenceMessageFormatter';

interface IntelligenceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  output: IntelligenceEngineOutput;
  studyElementRef: React.RefObject<HTMLDivElement | null>;
}

const SCOPE_LABELS: Array<{ id: DigestScope; label: string }> = [
  { id: 'executive', label: 'الملخص التنفيذي الشامل' },
  { id: 'critical_stockout', label: 'تنبيهات النفاد الحرجة' },
  { id: 'purchase', label: 'توصيات الشراء الصافية' },
  { id: 'transfers', label: 'التحويلات الداخلية' },
  { id: 'dead_stock', label: 'المخزون الراكد والفائض' },
];

export const IntelligenceShareModal: React.FC<IntelligenceShareModalProps> = ({
  isOpen,
  onClose,
  output,
  studyElementRef,
}) => {
  const companyId = useAuthStore(s => s.user?.company_id);
  const { showToast } = useFeedbackStore();
  const [scope, setScope] = useState<DigestScope>('executive');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [isSendingDoc, setIsSendingDoc] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage(buildExecutiveDigestMessage(output, scope));
    }
  }, [isOpen, output, scope]);

  const handleSendChannels = async () => {
    if (!companyId) {
      showToast('لم يتم التعرف على الشركة الحالية', 'error');
      return;
    }
    try {
      setIsSendingText(true);
      const res = await shareService.shareText(
        companyId,
        message,
        'inventory_intelligence_digest'
      );
      if (res.success) {
        showToast('تم إرسال الملخص عبر القنوات المفعّلة (تليجرام / واتساب)', 'success');
        onClose();
      } else {
        showToast('تعذر الإرسال — تأكد من تفعيل تليجرام أو واتساب في إعدادات التكامل', 'error');
      }
    } catch {
      showToast('حدث خطأ أثناء الإرسال', 'error');
    } finally {
      setIsSendingText(false);
    }
  };

  const handleSendStudyImage = async () => {
    if (!companyId || !studyElementRef.current) return;
    try {
      setIsSendingImage(true);
      const res = await shareService.shareImage(
        companyId,
        studyElementRef.current,
        `الدراسة التنفيذية لذكاء المخزون (${new Date(output.generatedAt).toLocaleDateString('ar-YE')})`,
        'inventory_intelligence_study'
      );
      if (res.success) {
        showToast('تم إرسال صورة الدراسة عبر القنوات المفعّلة بنجاح', 'success');
      } else {
        showToast('تعذر إرسال صورة الدراسة — تحقق من إعدادات البوت/واتساب', 'error');
      }
    } catch {
      showToast('حدث خطأ أثناء إرسال صورة الدراسة', 'error');
    } finally {
      setIsSendingImage(false);
    }
  };

  const handleSendExcelDocument = async () => {
    if (!companyId) return;
    try {
      setIsSendingDoc(true);
      const { base64, fileName } = await exportExecutiveStudyExcelBase64(output);
      const res = await shareService.shareDocument(
        companyId,
        base64,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `ملف الدراسة التنفيذية لذكاء المخزون (${new Date(output.generatedAt).toLocaleDateString('ar-YE')})`,
        'inventory_intelligence_study'
      );
      if (res.success) {
        showToast('تم إرسال ملف Excel عبر تليجرام بنجاح', 'success');
      } else {
        showToast('تعذر إرسال الملف — تأكد من تفعيل قناة تليجرام في الإعدادات', 'error');
      }
    } catch {
      showToast('حدث خطأ أثناء إرسال ملف Excel', 'error');
    } finally {
      setIsSendingDoc(false);
    }
  };

  const handleDirectWhatsApp = () => {
    if (!hasValidWhatsAppPhone(phone)) {
      showToast('أدخل رقم واتساب صحيحاً مع رمز الدولة (مثال: 967770000000)', 'error');
      return;
    }
    window.open(buildWhatsAppLink(phone, message), '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="مشاركة وإرسال دراسات ذكاء المخزون (تليجرام / واتساب)"
      size="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {SCOPE_LABELS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setScope(item.id);
              }}
              className={`rounded-lg border px-2.5 py-1.5 font-bold transition ${
                scope === item.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block font-bold text-[var(--app-text-secondary)]">
            نص الملخص القابل للتعديل قبل الإرسال
          </label>
          <textarea
            rows={10}
            value={message}
            onChange={e => {
              setMessage(e.target.value);
            }}
            className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 font-sans text-xs leading-relaxed text-[var(--app-text)]"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="font-bold text-[var(--app-text)]">إرسال تلقائي عبر قنوات المنظومة</div>
            <p className="text-[11px] text-[var(--app-text-secondary)]">
              يُرسل مباشرة إلى بوت تليجرام وواتساب المفعّلين في إعدادات التكامل.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                isLoading={isSendingText}
                onClick={() => {
                  void handleSendChannels();
                }}
                leftIcon={<Send size={13} />}
              >
                إرسال النص لتليجرام / واتساب
              </Button>
              <Button
                size="sm"
                variant="outline"
                isLoading={isSendingImage}
                onClick={() => {
                  void handleSendStudyImage();
                }}
                leftIcon={<ImageIcon size={13} />}
              >
                إرسال صورة الدراسة
              </Button>
              <Button
                size="sm"
                variant="outline"
                isLoading={isSendingDoc}
                onClick={() => {
                  void handleSendExcelDocument();
                }}
                leftIcon={<FileSpreadsheet size={13} />}
              >
                إرسال ملف Excel
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-[var(--app-text)]">إرسال مباشر لرقم واتساب محدد</div>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={phone}
                onChange={e => {
                  setPhone(e.target.value);
                }}
                placeholder="96777xxxxxxx"
                className="flex-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--app-text)]"
              />
              <Button
                size="sm"
                variant="success"
                onClick={handleDirectWhatsApp}
                leftIcon={<MessageCircle size={13} />}
              >
                فتح واتساب
              </Button>
            </div>
            <button
              type="button"
              onClick={() => {
                void exportExecutiveStudyExcel(output);
              }}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:underline"
            >
              <FileSpreadsheet size={13} />
              <span>تحميل ملف الدراسة Excel لإرفاقه يدوياً</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
