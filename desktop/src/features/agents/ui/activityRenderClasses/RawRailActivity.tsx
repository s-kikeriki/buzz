import { useLingui } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { ChevronDown } from "lucide-react";
import { useLocale } from "@/shared/lib/localePreference";

import {
  ActivityRow,
  ActivityRowContent,
  ActivityRowLabel,
} from "./ActivityRow";
import { ToolActivity } from "./ToolActivity";
import { formatTranscriptTimestampTitle } from "../agentSessionUtils";
import { PromptSectionList } from "../PromptSectionAccordion";
import type { ActivityRenderClassItemProps } from "./types";

export function RawRailActivity(props: ActivityRenderClassItemProps) {
  const { i18n } = useLingui();
  void i18n;
  const locale = useLocale();
  if (props.item.type === "tool") {
    return <ToolActivity {...props} />;
  }
  if (props.item.type !== "metadata") {
    return null;
  }

  const sectionCount = props.item.sections.length;
  const sectionSuffix = `${sectionCount} section${sectionCount === 1 ? "" : "s"}`;
  const isRawPayload = props.item.acpSource === "raw_json_rpc";

  return (
    <ActivityRow
      testId="transcript-metadata-item"
      title={formatTranscriptTimestampTitle(props.item.timestamp, locale)}
    >
      <ActivityRowLabel
        object={sectionSuffix}
        openToneScope="tool"
        verb={props.item.title}
      />
      <ActivityRowContent className="flex flex-col gap-3 py-2">
        {isRawPayload ? (
          props.item.sections.map((section) => (
            <details
              className="group/section"
              key={`${section.title}:${section.body.slice(0, 48)}`}
            >
              <summary className="inline-flex max-w-full cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground/60 group-open/section:text-foreground">
                <span className="truncate">{section.title}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open/section:rotate-180 group-open/section:text-foreground" />
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted/50 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
                {section.body.trim() || t`No metadata.`}
              </pre>
            </details>
          ))
        ) : (
          <PromptSectionList sections={props.item.sections} />
        )}
      </ActivityRowContent>
    </ActivityRow>
  );
}
