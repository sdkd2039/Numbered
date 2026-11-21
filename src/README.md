# بنية Worker معدودات

## الوحدات الحالية
- `index.js`: نقطة تجميع التشغيل ومسارات الطلبات والواجهة.
- `shared/http.js`: استجابات JSON وHTML والتحقق من الروابط.
- `pwa/handlers.js`: manifest وService Worker وأيقونة التطبيق.
- `notifications/archive.js`: أرشيف الإشعارات، سجل KV، تكرار/حذف الإشعار وإلغاء جدولة OneSignal.
- `files/service.js`: فهرس الملفات، تقديم الروابط، الحذف والتنظيف التلقائي عبر X02.
- `worker.js` في جذر المستودع: مدخل توافق يحوّل إلى `src/index.js`.

## ما لم يُنفذ بعد
- وحدة `sheets/` وواجهات CRUD للجداول لم تُنشأ بعد.
- لا توجد حتى الآن مصادقة جلسات مستقلة لخدمة Sheets.
- يجب مراجعة مخطط D1 الفعلي قبل كتابة استعلامات الجداول؛ لا يجوز افتراض أعمدة أو علاقات غير مؤكدة.

## إعدادات التشغيل التي يجب الحفاظ عليها
- KV binding: `NOTIFICATION_ARCHIVE`
- Secrets: `ADMIN_TOKEN`, `ONESIGNAL_REST_API_KEY`, `X02_API_KEY`
- OneSignal app ID محفوظ في وحدة الإشعارات.
- D1 database: `numbered_sheets_db` عبر binding باسم `SHEETS_DB`.
- لا تحذف قاعدة D1 أو KV ولا تعِد إنشاءها.
- لا يتم النشر إلى Cloudflare إلا بعد اختبار البناء والمسارات ومراجعة إعدادات Worker.
