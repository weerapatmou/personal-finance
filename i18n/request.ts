import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Locale resolution will be expanded in Phase 4 (read from User row).
  // Phase 1 ships static `th` to satisfy the next-intl plugin.
  const locale = "th";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
