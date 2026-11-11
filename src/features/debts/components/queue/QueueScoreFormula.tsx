import React from 'react';
import { ChevronDown } from 'lucide-react';

/** شرح المعادلة في تفاصيل قابلة للطي (لا يأكل ارتفاع الشاشة). */
const QueueScoreFormula: React.FC = () => (
  <details className="group border-t border-[var(--app-border)] px-3 py-1.5 text-[10px] leading-relaxed text-[var(--app-text-secondary)]">
    <summary className="flex cursor-pointer list-none items-center gap-1 font-bold">
      <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
      كيف تُحسب درجة الأهمية؟
    </summary>
    <p className="mt-1 max-w-4xl">
      الدرجة (0..100) = تخلّف زمني 40 + ثقل المبلغ بالعملة الأساسية 25 + وعد مكسور 20 + انقطاع
      التواصل 10 + مرحلة التصعيد 5. تُحسب على الخادم لأن الواجهة لا تملك مبالغ موحّدة العملة ولا
      سجل التواصل، لذا لا يُعاد ترتيب الصفوف محلياً عند تغيير الفرز — ويبقى عمود «أولوية» مرجعاً
      ثابتاً من الخادم.
    </p>
  </details>
);

export default QueueScoreFormula;
