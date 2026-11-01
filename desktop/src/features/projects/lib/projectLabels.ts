import { t } from "@lingui/core/macro";
import type { Project } from "@/features/projects/hooks";

export function getDiscussionLabel(project: Project) {
  return project.projectChannelId ? t`Discussion linked` : t`No discussion`;
}
