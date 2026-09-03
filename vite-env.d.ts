/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_TELEGRAM_ENABLED?: string;
  readonly VITE_OWNER_EMAIL?: string;
  readonly VITE_TEST_MODE?: string;
  readonly VITE_TEST_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
