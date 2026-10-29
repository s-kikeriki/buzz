import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui/BrandMark";
import BuzzLogoAnimation from "@/shared/ui/buzz-logo/BuzzLogoAnimation";

/**
 * Centered, low-emphasis loading state for page and panel fetches.
 *
 * One component behind seventeen call sites — every project, repository and
 * review panel waits behind this mark — so it is the widest single bee in the
 * signed-in app even though it appears once in the source.
 *
 * `opacity-45` on the brand mark rather than on the wrapper: the wrapper's
 * `text-muted-foreground/45` is what holds the stock mark back, and that is a
 * text colour an `<img>` cannot inherit. A flavor mark carries its own
 * colours, so without this it would arrive at full strength where the bee it
 * replaces is deliberately faint.
 */
export function BuzzLoadingState({
  className,
  fill = false,
  label = "Loading",
}: {
  className?: string;
  fill?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center text-muted-foreground/45",
        fill ? "min-h-0 flex-1" : "min-h-[calc(100dvh-7rem)]",
        className,
      )}
      data-testid="buzz-loading-state"
      role="status"
    >
      <BrandMark
        className="w-8 opacity-45"
        fallback={
          <BuzzLogoAnimation
            ariaLabel={label}
            className="buzz-logo--scale-pulse"
            fullScreen={false}
            showBackground={false}
            style={{ width: "2rem" }}
            textured={false}
          />
        }
        label={label}
        motion
      />
    </div>
  );
}
