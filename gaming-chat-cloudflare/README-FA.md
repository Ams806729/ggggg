# Gaming.Chat — نسخهٔ Cloudflare Workers

این نسخه برای انتشار روی Cloudflare Workers آماده شده است. سرور از Durable Objects با SQLite داخلی برای حساب‌ها، نشست‌ها و پیام‌ها استفاده می‌کند؛ بنابراین برای نسخهٔ اولیه نیازی به ساخت جداگانهٔ D1 نیست.

## امکانات این نسخه
- ساخت حساب با نام کاربری و رمز عبور (بدون شماره تلفن)
- شناسهٔ اختصاصی ۸ رقمی
- ورود و خروج
- چت خصوصی لحظه‌ای با WebSocket
- ذخیرهٔ پیام‌های متنی در SQLite داخلی Durable Object
- رابط فارسی و سازگار با موبایل/کامپیوتر
- هش رمز عبور با PBKDF2 و salt جداگانه

## محدودیت‌ها
این یک MVP آزمایشی است. گروه، کانال، ارسال فایل، تماس صوتی/تصویری، بازیابی رمز، مدیریت گزارش/مسدودسازی، محدودسازی تلاش‌های ورود و پنل مدیر هنوز پیاده‌سازی نشده‌اند. پیش از استفادهٔ عمومی باید محدودسازی درخواست، سیاست حریم خصوصی، پشتیبان‌گیری/بازیابی و تست امنیت مستقل اضافه شود. شناسهٔ ۸ رقمی محرمانه نیست؛ برای ورود حتماً رمز عبور لازم است.

## انتشار با داشبورد Cloudflare (بدون اجرای دستورات در کامپیوتر)
1. فایل ZIP را از حالت فشرده خارج کن.
2. همهٔ فایل‌ها و پوشه‌های داخل آن (`package.json`، `wrangler.jsonc`، `src` و `public`) را در ریشهٔ مخزن GitHub `gaming-chat` بارگذاری و Commit کن. اگر مخزن فایل‌های قبلی دارد، اول نسخهٔ پشتیبان بگیر؛ فایل‌های پروژهٔ قبلی ممکن است با این نسخه جایگزین شوند.
3. وارد https://dash.cloudflare.com/ شو و حساب رایگان بساز/وارد شو.
4. از بخش **Workers & Pages** گزینهٔ ساخت Worker یا اتصال Git repository را پیدا کن. اگر **Connect to Git** یا **Workers Builds** در دسترس است، مخزن `gaming-chat` را متصل کن.
5. ریشهٔ پروژه را انتخاب کن؛ Root Directory خالی بماند، چون `package.json` و `wrangler.jsonc` در ریشه‌اند.
6. Build command: `npm install`
7. Deploy command: `npm run deploy` (یا `npx wrangler deploy`)
8. در لاگ Deploy بررسی کن که migration مربوط به Durable Object `ChatService` اعمال شده باشد. فایل `wrangler.jsonc` شامل migration لازم است.
9. پس از موفقیت، لینک `workers.dev` را باز کن. ثبت‌نام آزمایشی با یک حساب و سپس حساب دوم انجام بده و چت را با شناسهٔ ۸ رقمی امتحان کن.

## اگر داشبورد اجازهٔ اتصال Git نداد
از روش رسمی Wrangler استفاده کن: روی کامپیوتر Node.js نصب باشد، پوشهٔ پروژه را باز کن و `npm install` و سپس `npx wrangler login` و `npm run deploy` را اجرا کن. این روش نیازمند چند دستور در ترمینال است؛ اگر می‌خواهی کاملاً بدون ترمینال پیش بروی، از مسیر Git/Workers Builds استفاده کن.

## پلن رایگان
Cloudflare Workers پلن رایگان دارد، اما محدودیت مصرف دارد. در مستندات جاری Workers Free سقف ۱۰۰٬۰۰۰ درخواست روزانه ذکر شده است. Durable Objects و SQLite نیز سهمیه‌های رایگان جداگانه دارند؛ در صورت عبور از سهمیه، ممکن است درخواست‌ها/ذخیره‌سازی تا ریست سهمیه متوقف شوند. پیش از انتشار، صفحهٔ قیمت و Limits رسمی Cloudflare را ببین:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

این فایل‌ها فقط پروژه را آماده می‌کنند؛ من نمی‌توانم بدون دسترسی به حساب Cloudflare/GitHub تو، آن را از طرف تو Deploy یا لینک آنلاین واقعی بسازم.
