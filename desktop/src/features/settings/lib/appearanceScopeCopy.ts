/**
 * Copy helper for the Appearance settings panel's per-community scoping.
 *
 * Theme, mode, and accent are saved per community (see
 * `shared/theme/CommunityThemeController`), so the panel badges the community
 * being customized. Kept as a pure function so the copy is unit-testable
 * without rendering the settings tree.
 */

/**
 * Display label for the community whose appearance is being edited.
 * Falls back to `fallbackLabel` when no community is active or the stored
 * name is blank.
 *
 * The fallback is passed in rather than hardcoded so the only user-facing
 * string stays at the call site, where the Lingui macro can extract it. A
 * catalogue lookup here would need the `i18n` instance and make this helper
 * unusable from a plain unit test.
 */
export function appearanceCommunityLabel(
  communityName: string | null | undefined,
  fallbackLabel: string,
): string {
  const trimmed = communityName?.trim();
  return trimmed ? trimmed : fallbackLabel;
}
