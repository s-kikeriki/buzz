import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const PROJECT_TASK_CATEGORIES = [
  { label: msg`Issue`, value: "issue" },
  { label: msg`Change request`, value: "change-request" },
  { label: msg`Improvement`, value: "improvement" },
] as const;

export type ProjectTaskCategory =
  (typeof PROJECT_TASK_CATEGORIES)[number]["value"];
export type ProjectTaskCategoryFilter = "all" | ProjectTaskCategory;

const PROJECT_TASK_CATEGORY_VALUES = new Set<string>(
  PROJECT_TASK_CATEGORIES.map(({ value }) => value),
);

export function isProjectTaskCategory(
  value: string,
): value is ProjectTaskCategory {
  return PROJECT_TASK_CATEGORY_VALUES.has(value.toLowerCase());
}

export function projectTaskCategoryFromLabels(
  labels: string[],
): ProjectTaskCategory {
  const category = labels
    .map((label) => label.toLowerCase())
    .find(isProjectTaskCategory);
  return category ?? "issue";
}

export function projectTaskCategoryLabel(category: ProjectTaskCategory) {
  return i18n._(
    PROJECT_TASK_CATEGORIES.find((option) => option.value === category)
      ?.label ?? msg`Issue`,
  );
}

export function projectTaskUserLabels(labels: string[]) {
  return labels.filter((label) => !isProjectTaskCategory(label));
}
