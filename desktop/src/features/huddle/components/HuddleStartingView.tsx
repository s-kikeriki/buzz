import { ThemeGrainientBackground } from "@/app/ThemeGrainientBackground";
import { BrandMark } from "@/shared/ui/BrandMark";
import { FlappingBee } from "@/shared/ui/buzz-logo/FlappingBee";

/**
 * Immediate feedback shown while the native huddle session is being prepared.
 *
 * The same shape as the cold-boot gate — grainient, one big mark — but not the
 * same surface, so not `BrandBootMark`. The boot gate pins itself to the
 * brand's ink canvas; this shell is `buzz-setup-loading-shell` with no ink
 * class, so it is light under a light document. `auto` is the honest answer,
 * and a flavor with a light cut gets it here.
 */
export function HuddleStartingView() {
  return (
    <div
      aria-label="Starting huddle"
      className="buzz-setup-loading-shell flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 text-foreground"
      data-testid="huddle-starting-view"
      role="status"
    >
      <ThemeGrainientBackground />
      <span className="sr-only">Starting huddle</span>
      <BrandMark
        className="relative z-10 h-auto w-28"
        fallback={<FlappingBee className="relative z-10 h-auto w-28" />}
        motion
      />
    </div>
  );
}
