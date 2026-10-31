import { Trans, useLingui } from "@lingui/react/macro";
export const WORK_ITEM_TABLE_GRID_CLASS =
  "grid w-full grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_3rem_5rem_1.5rem] items-center gap-x-3";

export function ProjectsWorkItemTableHeader({
  itemLabel,
  typeLabel,
}: {
  itemLabel: string;
  typeLabel: string;
}) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <thead className="sr-only">
      <tr>
        <th scope="col">{itemLabel}</th>
        <th scope="col">{typeLabel}</th>
        <th scope="col">
          <Trans>Status</Trans>
        </th>
        <th scope="col">
          <Trans>Replies</Trans>
        </th>
        <th scope="col">
          <Trans>Updated</Trans>
        </th>
        <th scope="col">
          <Trans>Actions</Trans>
        </th>
      </tr>
    </thead>
  );
}
