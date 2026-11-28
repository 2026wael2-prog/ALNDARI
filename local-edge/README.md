# خادم الحافة المحلي — فرع وائل النظاري (`B1`)

معمارية **«السحابة كأصل رئيسي + مرآة محلية احتياطية مع طابور إعادة تشغيل + نسخ تلقائي إلى Google Drive»** تعمل مباشرة على **Node.js 24** (`node:sqlite` + `FTS5`) باستهلاك ذاكرة **< 90 MB RAM** بدون Docker.

## خطوات التشغيل السريع على جهاز المحل

1. **إعداد ملف البيئة:**
   انسخ `.env.edge.example` إلى `.env.edge` واملأ:
   - `SUPABASE_ANON_KEY` (نفس مفتاح `VITE_SUPABASE_ANON_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY` (اختياري للمزامنة التلقائية بدون جلسة متصفح)
2. **ربط Google Drive للنسخ التلقائي (مرة واحدة فقط):**
   ```powershell
   cd local-edge
   npm run setup-gdrive
   ```
   ثم الصق `GDRIVE_CLIENT_ID` و `GDRIVE_CLIENT_SECRET` و `GDRIVE_REFRESH_TOKEN` في `.env.edge`.
3. **التشغيل اليدوي أو التثبيت التلقائي مع إقلاع Windows:**
   - تشغيل مباشر للاختبار: `npm start`
   - تثبيت كخدمة خلفية تلقائية على Windows (بصلاحية Administrator):
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1
     ```
4. **تشغيل نسخة احتياطية فورية أو اختبار:**
   - `npm test` — تشغيل اختبارات المرآة والطابور والنسخ المضغوط
   - `npm run backup-now` — إنشاء نسخة `.json.gz` + بصمة `SHA-256` ورفعها لـ Google Drive
