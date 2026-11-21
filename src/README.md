# بنية Worker معدودات

## الوحدات
- `index.js`: نقطة التشغيل ومسارات لوحة الإشعارات ومركز الملفات وواجهة Sheets API.
- `shared/http.js`: استجابات JSON وHTML والتحقق من الروابط.
- `pwa/handlers.js`: manifest وService Worker والأيقونات.
- `notifications/archive.js`: أرشيف الإشعارات وعمليات OneSignal.
- `files/service.js`: خدمة الملفات وX02 والتنظيف.
- `sheets/api.js`: مصادقة مستقلة وواجهات الجداول عبر D1.
- `worker.js`: مدخل توافق يحوّل إلى `src/index.js`.

## واجهة Sheets API
جميع المسارات تحت `/api/sheets/`، وتستخدم JSON. بعد تسجيل الدخول أرسل:
`Authorization: Bearer <token>`

- `POST /api/sheets/auth/bootstrap`: إنشاء حساب الإدارة الأول فقط. يتطلب السر `SHEETS_BOOTSTRAP_SECRET` في Worker، واسم مستخدم، وكلمة مرور لا تقل عن 12 حرفًا. لا يمكن إعادة التهيئة بعد إنشاء الحساب.
- `POST /api/sheets/auth/login`: تسجيل الدخول؛ يصدر جلسة صالحة لمدة 14 يومًا. توجد حماية من تكرار محاولات الدخول.
- `POST /api/sheets/auth/logout`: إبطال الجلسة.
- `GET /api/sheets/workbooks`: قائمة الجداول الخاصة بالحساب.
- `POST /api/sheets/workbooks`: إنشاء جدول مع ورقة أولى تلقائيًا.
- `DELETE /api/sheets/workbooks/:id`: حذف جدول الحساب وما يتبعه وفق علاقات D1.
- `GET /api/sheets/workbooks/:id/sheets`: قائمة الأوراق.
- `POST /api/sheets/workbooks/:id/sheets`: إنشاء ورقة.
- `GET /api/sheets/sheets/:id/cells`: قراءة الخلايا.
- `PUT /api/sheets/sheets/:id/cells`: حفظ حتى 300 خلية في الطلب.

## إعداد مطلوب قبل تفعيل الخدمة
- أضف Secret باسم `SHEETS_BOOTSTRAP_SECRET` في إعدادات Worker. لا تضعه في GitHub ولا ترسله داخل المحادثة.
- تأكد من أن D1 binding باسم `SHEETS_DB` يشير إلى قاعدة `numbered_sheets_db`.
- أول تهيئة للحساب تتم مرة واحدة فقط عبر bootstrap. احتفظ ببيانات الدخول في مكان آمن.

## الحفاظ على الخدمات الحالية
- KV binding: `NOTIFICATION_ARCHIVE`
- Secrets الحالية: `ADMIN_TOKEN`, `ONESIGNAL_REST_API_KEY`, `X02_API_KEY`
- لا تحذف قاعدة D1 أو KV ولا تعِد إنشاءهما.
- لم يتم نشر تغييرات هذا الفرع إلى Cloudflare. يلزم اختبار build وواجهات API قبل النشر.
