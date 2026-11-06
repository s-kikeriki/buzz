import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Input } from "@/shared/ui/input";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { WorkflowAuthorPicker } from "./WorkflowAuthorPicker";
import { WorkflowEmojiField } from "./WorkflowEmojiField";
import { WorkflowMessagePicker } from "./WorkflowMessagePicker";
import { useWorkflowTriggerPresentation } from "./useWorkflowTriggerPresentation";
import { FieldLabel } from "./workflowFormPrimitives";
import {
  buildConditionExpressions,
  conditionFieldsForTrigger,
  conditionOperatorNeedsValue,
  conditionOperatorsForField,
  conditionValueError,
  conditionValueIsInvalid,
  parseConditionExpressions,
  type ConditionOperator,
  type ParsedConditionExpression,
} from "./workflowConditionExpression";
import type { TriggerType } from "./workflowFormTypes";

/**
 * The operator buttons, and the same phrase in the collapsed row's summary.
 *
 * Every value is one or two words, which is the shape the coverage detector
 * reports zero findings for — `isProse` wants three. Reading the file is the
 * only thing that finds this table.
 */
const OPERATOR_LABELS: Record<ConditionOperator, MessageDescriptor> = {
  contains: msg`contains`,
  not_contains: msg`does not contain`,
  starts_with: msg`starts with`,
  ends_with: msg`ends with`,
  equals: msg`is`,
  not_equals: msg`is not`,
  is_not_empty: msg`is not empty`,
  is_empty: msg`is empty`,
};

function emptyCondition(field: string): ParsedConditionExpression {
  return {
    field,
    operator: conditionOperatorsForField(field)[0],
    value: "",
    webhookField: "",
  };
}

function compact(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 20
    ? trimmed
    : `${trimmed.slice(0, 11)}…${trimmed.slice(-6)}`;
}

function fieldUsesFullHeightPicker(field: string): boolean {
  return field === "trigger_author" || field === "trigger_message_id";
}

function fieldPlaceholder(field: string, i18n: I18n): string {
  if (field === "trigger_author") {
    return i18n._(msg`64-character hex pubkey`);
  }
  if (field === "trigger_message_id") {
    return i18n._(msg`64-character hex event ID`);
  }
  return i18n._(msg`e.g. deploy`);
}

function ExclusionStrike() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-0 [clip-path:circle(50%_at_50%_50%)]">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="block h-1 w-9 translate-y-0.5 -rotate-45 rounded-full bg-background/90" />
        </span>
      </span>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="block h-0.5 w-8 -rotate-45 rounded-full bg-muted-foreground" />
      </span>
    </span>
  );
}

function AuthorConditionSummary({
  avatarUrl,
  excluded,
  isAgent,
  label,
}: {
  avatarUrl: string | null;
  excluded: boolean;
  isAgent?: boolean;
  label: string;
}) {
  return (
    <span className="flex shrink-0 items-center">
      <span className="relative shrink-0">
        <UserAvatar
          avatarUrl={avatarUrl}
          className="h-6 w-6"
          displayName={label}
          fallbackDelayMs={0}
          shape={isAgent ? "squircle" : "circle"}
          size="xs"
        />
        {excluded ? <ExclusionStrike /> : null}
      </span>
      <span className="sr-only">
        {excluded ? (
          <Trans>Excluded author: {label}</Trans>
        ) : (
          <Trans>Selected author: {label}</Trans>
        )}
      </span>
    </span>
  );
}

function EmojiConditionSummary({
  emoji,
  excluded,
}: {
  emoji: string;
  excluded: boolean;
}) {
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <span aria-hidden="true" className="text-2xl leading-none">
        {emoji}
      </span>
      {excluded ? <ExclusionStrike /> : null}
      <span className="sr-only">
        {excluded ? (
          <Trans>Excluded reaction emoji: {emoji}</Trans>
        ) : (
          <Trans>Selected reaction emoji: {emoji}</Trans>
        )}
      </span>
    </span>
  );
}

export function WorkflowTriggerConditions({
  conditionDrafts,
  disabled,
  onChange,
  onConditionDraftsChange,
  triggerType,
  value,
  workflowChannelId,
}: {
  conditionDrafts: ParsedConditionExpression[] | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  onConditionDraftsChange: (drafts: ParsedConditionExpression[] | null) => void;
  triggerType: Extract<
    TriggerType,
    "message_posted" | "diff_posted" | "reaction_added"
  >;
  value: string;
  workflowChannelId?: string | null;
}) {
  const { i18n, t } = useLingui();
  const parsedValue = React.useMemo(
    () => parseConditionExpressions(value, triggerType),
    [triggerType, value],
  );
  const [mode, setMode] = React.useState<"basic" | "advanced">(() =>
    value && parsedValue === null ? "advanced" : "basic",
  );
  const [expandedField, setExpandedField] = React.useState<string | null>(
    () => conditionFieldsForTrigger(triggerType)[0]?.value ?? null,
  );
  const disclosureButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const collapsePicker = React.useCallback((field: string) => {
    setExpandedField(null);
    disclosureButtons.current.get(field)?.focus();
  }, []);
  const conditions = conditionDrafts ?? parsedValue ?? [];
  const localValue = React.useRef(value);
  const triggerPresentation = useWorkflowTriggerPresentation(
    {
      filter: conditions.length
        ? buildConditionExpressions(conditions)
        : undefined,
      on: triggerType,
    },
    workflowChannelId,
  );

  React.useEffect(() => {
    if (value === localValue.current) return;
    localValue.current = value;
    const parsed = parseConditionExpressions(value, triggerType);
    if (parsed) {
      onConditionDraftsChange(null);
      setMode("basic");
    } else if (value) {
      setMode("advanced");
    }
  }, [onConditionDraftsChange, triggerType, value]);

  const updateConditions = (next: ParsedConditionExpression[]) => {
    onConditionDraftsChange(next);
    if (
      next.some((condition) =>
        conditionValueIsInvalid(condition.field, condition.value),
      )
    ) {
      return;
    }
    const expression = buildConditionExpressions(next);
    localValue.current = expression;
    onChange(expression);
  };

  const fields = conditionFieldsForTrigger(triggerType);
  const fullHeightPickerExpanded =
    mode === "basic" && fieldUsesFullHeightPicker(expandedField ?? "");

  return (
    <Tabs
      className={cn(
        "space-y-3",
        fullHeightPickerExpanded &&
          "flex h-full min-h-0 flex-col space-y-0 gap-3",
      )}
      onValueChange={(next) => setMode(next as "basic" | "advanced")}
      value={mode}
    >
      <TabsList
        aria-label={t`Condition editor mode`}
        className="grid h-9 w-full grid-cols-2 p-0.5"
      >
        <TabsTrigger className="h-8" disabled={disabled} value="basic">
          <Trans>Basic</Trans>
        </TabsTrigger>
        <TabsTrigger className="h-8" disabled={disabled} value="advanced">
          <Trans>Advanced</Trans>
        </TabsTrigger>
      </TabsList>

      {mode === "advanced" ? (
        <div className="space-y-2">
          <Input
            aria-label={t`Advanced expression`}
            autoCapitalize="off"
            autoCorrect="off"
            disabled={disabled}
            onChange={(event) => {
              onConditionDraftsChange(null);
              localValue.current = event.target.value;
              onChange(event.target.value.trim());
            }}
            placeholder={t`e.g. trigger_author == "…"`}
            value={value}
          />
          <p className="text-xs text-muted-foreground">
            <Trans>
              Use an evalexpr expression. Existing custom expressions stay
              unchanged.
            </Trans>
          </p>
        </div>
      ) : parsedValue === null && value.trim() ? (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
          <p className="text-xs text-muted-foreground">
            <Trans>
              An advanced expression is active. Replacing it with basic filters
              cannot be undone.
            </Trans>
          </p>
          <button
            className="text-sm font-medium text-destructive hover:underline"
            disabled={disabled}
            onClick={() => {
              onConditionDraftsChange(null);
              localValue.current = "";
              onChange("");
            }}
            type="button"
          >
            <Trans>Replace with basic filters</Trans>
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "divide-y divide-border/50",
            fullHeightPickerExpanded && "flex min-h-0 flex-1 flex-col",
          )}
        >
          {fields.map((field) => {
            const existing = conditions.find(
              (condition) => condition.field === field.value,
            );
            const condition = existing ?? emptyCondition(field.value);
            const expanded = expandedField === field.value;
            const error = conditionValueError(
              field.value,
              condition.value,
              i18n,
            );
            // `Any` is a string literal in a ternary — the detector reports at
            // most one branch of those, and here it reported neither.
            const summary = existing
              ? `${i18n._(OPERATOR_LABELS[condition.operator])}${condition.value ? ` ${compact(condition.value)}` : ""}`
              : i18n._(msg`Any`);
            const authorSummary =
              existing &&
              field.value === "trigger_author" &&
              triggerPresentation.pubkey &&
              triggerPresentation.label
                ? triggerPresentation.label
                : null;
            const messageSummary =
              existing &&
              field.value === "trigger_message_id" &&
              triggerPresentation.messageId &&
              triggerPresentation.messageLabel
                ? triggerPresentation.messageLabel
                    .trim()
                    .replaceAll(/\s+/g, " ")
                : null;
            return (
              <div
                className={cn(
                  expanded && "pb-4 last:pb-0",
                  expanded &&
                    fieldUsesFullHeightPicker(field.value) &&
                    "flex min-h-0 flex-1 flex-col",
                )}
                key={field.value}
              >
                <button
                  aria-expanded={expanded}
                  className="flex min-h-12 w-full items-center gap-3 py-3 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                  disabled={disabled}
                  onClick={() =>
                    setExpandedField(expanded ? null : field.value)
                  }
                  ref={(button) => {
                    if (button)
                      disclosureButtons.current.set(field.value, button);
                    else disclosureButtons.current.delete(field.value);
                  }}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate text-base font-medium">
                    {i18n._(field.label)}
                  </span>
                  {authorSummary ? (
                    <AuthorConditionSummary
                      avatarUrl={triggerPresentation.avatarUrl}
                      excluded={condition.operator === "not_equals"}
                      isAgent={triggerPresentation.isAgent}
                      label={authorSummary}
                    />
                  ) : messageSummary ? (
                    <span
                      className={cn(
                        "max-w-44 truncate text-xs text-muted-foreground",
                        condition.operator === "not_equals" && "line-through",
                      )}
                    >
                      “{messageSummary}”
                    </span>
                  ) : existing &&
                    field.value === "trigger_emoji" &&
                    condition.value.trim() ? (
                    <EmojiConditionSummary
                      emoji={condition.value.trim()}
                      excluded={condition.operator === "not_equals"}
                    />
                  ) : (
                    <span className="max-w-44 truncate font-mono text-xs text-muted-foreground">
                      {summary}
                    </span>
                  )}
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 motion-reduce:transition-none",
                      expanded && "rotate-90",
                    )}
                  />
                </button>
                {expanded ? (
                  <div
                    className={cn(
                      "animate-in space-y-3 pt-1 fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none",
                      fieldUsesFullHeightPicker(field.value) &&
                        "flex min-h-0 flex-1 flex-col space-y-0 gap-3",
                    )}
                  >
                    <fieldset>
                      <legend className="sr-only">
                        <Trans>Match</Trans>
                      </legend>
                      <div className="grid grid-cols-2 gap-2.5">
                        {conditionOperatorsForField(field.value).map(
                          (operator) => {
                            const selected = condition.operator === operator;
                            return (
                              <button
                                aria-pressed={selected}
                                className={cn(
                                  "flex min-h-12 items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-medium",
                                  "outline-2 outline-offset-2 outline-transparent transition-[background-color,border-color,color,outline-color] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                                  selected
                                    ? "border-border/0 bg-transparent text-foreground outline-foreground/45"
                                    : "border-border/70 bg-background/35 text-muted-foreground hover:border-border hover:bg-muted/55 hover:text-foreground hover:outline-muted-foreground/20",
                                )}
                                disabled={disabled}
                                key={operator}
                                onClick={() => {
                                  const next = { ...condition, operator };
                                  updateConditions([
                                    ...conditions.filter(
                                      (item) => item.field !== field.value,
                                    ),
                                    next,
                                  ]);
                                }}
                                type="button"
                              >
                                {i18n._(OPERATOR_LABELS[operator])}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </fieldset>
                    {conditionOperatorNeedsValue(condition.operator) ? (
                      field.value === "trigger_emoji" ? (
                        <WorkflowEmojiField
                          ariaLabel={t`Choose trigger emoji`}
                          clearAriaLabel={t`Clear trigger emoji`}
                          disabled={disabled}
                          id="wf-trigger-emoji"
                          onChange={(emoji) =>
                            updateConditions([
                              ...conditions.filter(
                                (item) => item.field !== field.value,
                              ),
                              { ...condition, value: emoji ?? "" },
                            ])
                          }
                          value={condition.value}
                        />
                      ) : field.value === "trigger_author" ? (
                        <WorkflowAuthorPicker
                          channelId={workflowChannelId}
                          disabled={disabled}
                          id="wf-trigger-author-value"
                          onEscape={() => collapsePicker(field.value)}
                          onChange={(pubkey) =>
                            updateConditions(
                              pubkey
                                ? [
                                    ...conditions.filter(
                                      (item) => item.field !== field.value,
                                    ),
                                    { ...condition, value: pubkey },
                                  ]
                                : conditions.filter(
                                    (item) => item.field !== field.value,
                                  ),
                            )
                          }
                          value={condition.value}
                        />
                      ) : field.value === "trigger_message_id" ? (
                        <WorkflowMessagePicker
                          channelId={workflowChannelId}
                          disabled={disabled}
                          id="wf-trigger-message-id-value"
                          key={workflowChannelId ?? "unscoped"}
                          onEscape={() => collapsePicker(field.value)}
                          onChange={(messageId) =>
                            updateConditions(
                              messageId
                                ? [
                                    ...conditions.filter(
                                      (item) => item.field !== field.value,
                                    ),
                                    { ...condition, value: messageId },
                                  ]
                                : conditions.filter(
                                    (item) => item.field !== field.value,
                                  ),
                            )
                          }
                          value={condition.value}
                        />
                      ) : (
                        <div className="space-y-1.5">
                          <FieldLabel
                            htmlFor={`wf-trigger-${field.value}-value`}
                          >
                            {i18n._(field.label)}
                          </FieldLabel>
                          <Input
                            aria-describedby={
                              error
                                ? `wf-trigger-${field.value}-error`
                                : undefined
                            }
                            aria-invalid={error ? true : undefined}
                            autoCapitalize="off"
                            autoCorrect="off"
                            disabled={disabled}
                            id={`wf-trigger-${field.value}-value`}
                            onChange={(event) =>
                              updateConditions([
                                ...conditions.filter(
                                  (item) => item.field !== field.value,
                                ),
                                { ...condition, value: event.target.value },
                              ])
                            }
                            placeholder={fieldPlaceholder(field.value, i18n)}
                            spellCheck={field.value === "trigger_text"}
                            value={condition.value}
                          />
                          {error ? (
                            <p
                              className="text-xs text-destructive"
                              id={`wf-trigger-${field.value}-error`}
                            >
                              {error}
                            </p>
                          ) : null}
                        </div>
                      )
                    ) : null}
                    {existing && !fieldUsesFullHeightPicker(field.value) ? (
                      <button
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        disabled={disabled}
                        onClick={() =>
                          updateConditions(
                            conditions.filter(
                              (item) => item.field !== field.value,
                            ),
                          )
                        }
                        type="button"
                      >
                        <Trans>Clear filter</Trans>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Tabs>
  );
}
