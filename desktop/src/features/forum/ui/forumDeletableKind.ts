/**
 * What a forum delete action is acting on.
 *
 * The delete menu and its confirmation dialog used to take the noun as a
 * `label: string` and interpolate it into their copy. That cannot be
 * translated: German inflects the article with the noun's gender, so the
 * surrounding sentence changes shape per case. Passing the case instead lets
 * each sentence be written out whole.
 */
export type ForumDeletableKind = "post" | "reply";
