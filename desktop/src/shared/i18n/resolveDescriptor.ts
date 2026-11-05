import type { I18n, MessageDescriptor, Values } from "@lingui/core";

/**
 * Resolve a `msg` descriptor that has placeholders.
 *
 * `i18n._(descriptor)` takes no second argument in its type signature, so a
 * module-level table whose entries interpolate anything cannot be resolved with
 * it directly. Folding the values into the descriptor is the supported shape.
 */
export function resolveDescriptor(
  i18n: I18n,
  descriptor: MessageDescriptor,
  values: Values,
): string {
  return i18n._({ ...descriptor, values });
}
