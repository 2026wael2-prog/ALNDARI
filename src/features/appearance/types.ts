
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeCSSVars {
  '--app-bg': string;
  '--app-surface': string;
  '--app-surface-hover': string;
  '--app-border': string;
  '--app-text': string;
  '--app-text-secondary': string;
  '--accent': string;

  /**
   * حدود شبكة الخلايا في الجداول (زخرفية مثل خطوط إكسل).
   * عند غيابها تسقط تلقائياً إلى --app-border في themeStore.
   */
  '--app-grid'?: string;
  /** خلفية الصفوف المخططة (Zebra rows). */
  '--app-zebra'?: string;
  /** لون سطح الكروت — يسقط إلى --app-surface عند غيابه. */
  '--app-card'?: string;
  /**
   * حد خفيف جداً للفواصل الداخلية (`border-gray-100` / `dark:border-slate-800`).
   * عند غيابه يسقط إلى --app-border في index.css.
   */
  '--app-border-subtle'?: string;
  /**
   * حد عناصر التحكّم (`border-gray-300` / `dark:border-slate-600`) — يجب أن
   * يحقق ≥ 3:1 مع سطحه (WCAG 1.4.11). عند غيابه يسقط إلى --app-border.
   */
  '--app-border-strong'?: string;
  /**
   * البرتقالي/اللون الفاتح لأسطح الشريط والمؤشرات.
   * عند غيابه يُشتق من --accent عبر color-mix في index.css.
   */
  '--brand-500'?: string;
  /** لون النص والأيقونات فوق --brand-500 (يجب أن يحقق تبايناً كافياً). */
  '--brand-ink'?: string;
  /** البرتقالي الداكن للحالات النشطة */
  '--brand-600'?: string;
  /** البرتقالي الداكن الغامق */
  '--brand-700'?: string;
  /** الذهبي الفاتح للعناصر الثانوية والتدرجات */
  '--secondary-gold'?: string;
  /** الأصفر الذهبي */
  '--accent-gold-yellow'?: string;
  /** خلفية حقول الإدخال */
  '--app-input-bg'?: string;
  /** خلفية ترويسة الجداول */
  '--table-header-bg'?: string;
  /** لون نص ترويسة الجداول */
  '--table-header-fg'?: string;
  /** خلفية الصفوف المحددة أو النشطة في الجداول */
  '--table-selected-row'?: string;
  /** لون خلفية الحقول المعدلة */
  '--field-modified-bg'?: string;
  /** اللون الأزرق للعناصر التفاعلية والروابط */
  '--interactive-blue'?: string;

  /* ── طبقة قشرة الميزان الكلاسيكي (اختيارية — لها قيم افتراضية في index.css) ── */
  /** خلفية شريط العنوان. */
  '--classic-chrome'?: string;
  /** خلفية شريط القوائم والشريط. */
  '--classic-chrome-2'?: string;
  /** حدود/فواصل عناصر القشرة. */
  '--classic-chrome-border'?: string;
  /** خلفية العنصر عند المرور. */
  '--classic-hover'?: string;
  /** إطار العنصر عند المرور. */
  '--classic-hover-border'?: string;
  /** خلفية العنصر المحدد. */
  '--classic-active'?: string;
  /** إطار/مؤشر العنصر النشط. */
  '--classic-active-border'?: string;
  /** خلفية شريحة الأيقونة الهادئة. */
  '--classic-icon'?: string;
  /** لون أيقونة الشريحة الهادئة. */
  '--classic-icon-fg'?: string;
  /** خلفية اللوحة المنسدلة. */
  '--classic-panel'?: string;
  /** إطار اللوحة المنسدلة. */
  '--classic-panel-border'?: string;
  /** ظل اللوحة المنسدلة. */
  '--classic-panel-shadow'?: string;

  '--glass-blur'?: string;
  '--glass-opacity'?: string;

  /* ── جسر لوحة slate الليلية (انظر MIZAN_NIGHT_SLATE) ──
     تُربط بأصناف Tailwind الحرفية عبر tailwind.config.js، فتصير
     `dark:bg-slate-800` قابلة للتلوين من الثيم دون تعديل المكوّنات. */
  '--slate-50'?: string;
  '--slate-100'?: string;
  '--slate-200'?: string;
  '--slate-300'?: string;
  '--slate-400'?: string;
  '--slate-500'?: string;
  '--slate-600'?: string;
  '--slate-700'?: string;
  '--slate-750'?: string;
  '--slate-800'?: string;
  '--slate-850'?: string;
  '--slate-900'?: string;
  '--slate-950'?: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: string[]; // مصفوفة الألوان التي تظهر في الجانب الأيسر للبطاقة
  previewColor: string; // اللون الرئيسي للمعاينة
  isDark: boolean; // هل الثيم مخصص للوضع الليلي؟
  accent?: string; // لون التمييز الرئيسي
  category?: 'premium' | 'classic' | 'beige' | 'royal' | 'accounting' | 'nature' | 'bold' | 'corporate' | 'night' | 'seasonal' | 'artistic' | 'industry' | 'glass' | 'bento' | 'automotive'; // تصنيف الثيم
  emoji?: string; // رمز تعبيري للثيم
  /**
   * شكل الزوايا: 'square' = هوية مكتبية كلاسيكية (2px)،
   * يُطبَّق عالمياً عبر html[data-corners='square'] في index.css.
   */
  corners?: 'rounded' | 'square';
  /**
   * الشكل الهيكلي المقترح: 'classic' = قوائم + شريط أوامر مكتبي بدل الشريط الجانبي.
   * تفضيل المستخدم (themeStore.uiLayout) يتجاوز هذه القيمة، والقشرة الكلاسيكية
   * تُطبَّق على الشاشات العريضة (lg = 1024px فأعلى) فقط؛ ما دونها يبقى على الشكل الحديث.
   */
  layout?: 'modern' | 'classic';
  cssVars: ThemeCSSVars; // متغيرات CSS التي تُطبق فعلياً (للتوافق مع الثيمات القديمة)
  light?: ThemeCSSVars; // متغيرات الوضع النهاري للثيمات الاحترافية
  dark?: ThemeCSSVars; // متغيرات الوضع الليلي للثيمات الاحترافية
}

export type AppearanceTab = 'premium' | 'ready' | 'colors' | 'fonts' | 'effects';
