/**
 * `@lingui/vite-plugin` compiles `.po` catalogues into modules at import time.
 * TypeScript has no knowledge of that transform, so declare the shape here.
 */
declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}
