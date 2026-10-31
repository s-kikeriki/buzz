import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/shared/lib/cn";

type PersonaAddedByProps = {
  className?: string;
  label?: string;
};

export function PersonaAddedBy({
  className,
  label = "You",
}: PersonaAddedByProps) {
  const { i18n } = useLingui();
  void i18n;
  return (
    <p className={cn("truncate text-xs leading-tight", className)}>
      <span className="text-muted-foreground/55">
        <Trans>Added by</Trans>
      </span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}
