import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      CREDENTIAL_ENCRYPTION_KEY: string;
      AUTH_MODE?: string;
      ADMIN_EMAILS?: string;
      ADMIN_USERNAME?: string;
      ADMIN_PASSWORD_HASH?: string;
      AUTH_SESSION_SECRET?: string;
      TEST_MIGRATIONS?: D1Migration[];
    }
  }
}

export {};
