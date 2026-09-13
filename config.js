

module.exports = {
  // رقم البورت اللي السيرفر هيشتغل عليه محلياً (سيبه زي ما هو غالباً)
  PORT: 8080,

  // اسم موقعك اللي هيظهر في الشريط الجانبي وعنوان الصفحة
  SITE_NAME: 'NexoAPI',

  // دومين موقعك لو عندك واحد (سيبه زي ما هو لو لسه شغال بالـ IP بس)
  SITE_DOMAIN: 'api-production-8186.up.railway.app',

  // ده الباسورد بتاعك — اللي هتكتبه في صفحة /login عشان تدخل الكونسول.
  // تقدر تغيره لأي حاجة انت عايزها.
  ADMIN_TOKEN: '55e1bf4ec62f38f4b41bc19d0a326d39',

  // سر داخلي بس لتشفير الجلسة، سيبه زي ما هو
  SESSION_SECRET: 'a91f960f11940bd2c74a2c16ab9fe86e',

  // هاتهم من https://my.telegram.org -> API development tools
  TELEGRAM_API_ID: '',
  TELEGRAM_API_HASH: ''
};
