/** سقف صفوف الطابور المطلوبة من الخادم (الخادم يقيّد الطلب بنفسه). */
export const QUEUE_LIMIT = 200;
/** وضع التركيز: أعلى N مهمة فقط حين يريد المحصّل تنفيذاً سريعاً بلا تشتيت. */
export const FOCUS_ROWS = 10;

/** زر شبح موحّد لكل أزرار ترويسة الطابور. */
export const ghostButton =
  'inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2 py-1 text-[11px] font-bold text-[var(--app-text-secondary)] transition-colors hover:border-blue-500/40 hover:text-blue-600';
