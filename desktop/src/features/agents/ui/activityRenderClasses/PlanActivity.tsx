import { Trans, useLingui } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { Markdown } from "@/shared/ui/markdown";
import { useLocale } from "@/shared/lib/localePreference";
import {
  ActivityRow,
  ActivityRowContent,
  ActivityRowLabel,
} from "./ActivityRow";
import { ToolActivity } from "./ToolActivity";
import { formatTranscriptTimestampTitle } from "../agentSessionUtils";
import type { ActivityRenderClassItemProps } from "./types";

export function PlanActivity(props: ActivityRenderClassItemProps) {
  const { i18n } = useLingui();
  void i18n;
  const locale = useLocale();
  if (props.item.type === "tool") {
    return <ToolActivity {...props} />;
  }
  if (props.item.type !== "plan") {
    return null;
  }

  if (props.item.isUpdate) {
    return (
      <ActivityRow
        testId="transcript-plan-update-item"
        title={formatTranscriptTimestampTitle(props.item.timestamp, locale)}
      >
        <ActivityRowLabel
          object={<PlanUpdateLabelObject text={props.item.text} />}
          openToneScope="none"
          verb="Updated"
        />
      </ActivityRow>
    );
  }

  return (
    <ActivityRow
      testId="transcript-plan-item"
      title={formatTranscriptTimestampTitle(props.item.timestamp, locale)}
    >
      <ActivityRowLabel object="plan" openToneScope="tool" verb="Updated" />
      <ActivityRowContent className="pt-1 pb-1.5 text-sm leading-5 text-muted-foreground">
        <Markdown
          className="leading-5"
          content={props.item.text.trim() || t`No plan details.`}
        />
      </ActivityRowContent>
    </ActivityRow>
  );
}

function PlanUpdateLabelObject({ text }: { text: string }) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <>
      <Trans>plan</Trans>
      {text ? (
        <>
          {" · "}
          <span className="text-foreground">{text}</span>
        </>
      ) : null}
    </>
  );
}
