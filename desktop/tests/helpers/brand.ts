// @ts-expect-error — plain JS build tooling, no types alongside it.
import { flavorBuildEnv, loadFlavor } from "../../scripts/flavor-config.mjs";

/**
 * The product name the bundle under test was actually built with.
 *
 * A spec that hardcodes "Buzz" passes on the trunk and fails on every
 * flavored build, for no reason connected to the behaviour it covers. Six
 * specs did exactly that on the first full flavored run of merged main —
 * `getByRole("button", { name: "Take me to Buzz" })` and friends — and they
 * read as app regressions rather than as test bugs, which is the expensive
 * part.
 *
 * Derived rather than mapped. `flavorBuildEnv` is the function the build
 * itself calls to turn a flavor file into `VITE_BUZZ_PRODUCT_NAME`, and
 * `brand.ts` reads that one variable, so this cannot disagree with what the
 * bundle shows — a flavor that renames itself renames these assertions in the
 * same commit. Reading `flavor.productName` directly would be one field away
 * from the same answer and free to drift from it.
 *
 * With no `BUZZ_E2E_FLAVOR` the answer is the trunk's own fallback, which is
 * the same default `brand.ts` applies when no overlay is set.
 */
const DEFAULT_PRODUCT_NAME = "Buzz";

function readProductName(): string {
  const flavorId = process.env.BUZZ_E2E_FLAVOR;
  if (!flavorId) {
    return DEFAULT_PRODUCT_NAME;
  }
  const name = flavorBuildEnv(loadFlavor(flavorId)).VITE_BUZZ_PRODUCT_NAME;
  return typeof name === "string" && name.trim().length > 0
    ? name.trim()
    : DEFAULT_PRODUCT_NAME;
}

export const PRODUCT_NAME = readProductName();

/** True when this run is against a bundle built with a brand mark. */
export function flavorHasMark(): boolean {
  const flavorId = process.env.BUZZ_E2E_FLAVOR;
  if (!flavorId) {
    return false;
  }
  return Boolean(flavorBuildEnv(loadFlavor(flavorId)).VITE_BUZZ_PRODUCT_LOGO_MARK);
}
