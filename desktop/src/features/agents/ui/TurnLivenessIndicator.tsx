import { useLingui } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui/BrandMark";
import { FuzzyLogo } from "@/shared/ui/buzz-logo/FuzzyLogo";
import { useTranscriptAnimationEnabled } from "./transcriptAnimationPreference";

const MARKS = ["first", "second", "third"] as const;
const STAGGER_SECONDS = 0.25;
const CYCLE_SECONDS = 1.8;

/**
 * The row that says an agent turn is still running, at the foot of the live
 * transcript.
 *
 * The most-seen mark in the signed-in app: it is mounted for the whole of
 * every turn, in the Activity panel and in the session view, so a branded
 * build that still flies bees here flies them most of the working day.
 *
 * Both branches are marks on the app's own surfaces, which do follow the
 * document mode — unlike the first-run gates, which force their own canvas.
 * So `auto`, and a flavor with one cut gets that cut in both modes.
 *
 * Only the still branch breathes. The staggered row's marks are already being
 * animated by the `motion.div` around each one, and `motion` would scale them
 * against that — two transforms on one element, where the stock row has one.
 *
 * Decorative in both branches: the wrapper owns the `role="status"` label, so
 * a named mark would be a second screen-reader stop for one indicator.
 */
export function TurnLivenessIndicator({
  className,
  fuzz = false,
}: {
  className?: string;
  /** Defaults to false — the indicator stays mounted for whole turns. */
  fuzz?: boolean;
}) {
  const { i18n } = useLingui();
  void i18n;
  const animationsEnabled = useTranscriptAnimationEnabled();
  const shouldReduceMotion = useReducedMotion();
  const showStaggeredRow = animationsEnabled && !shouldReduceMotion;

  if (!showStaggeredRow) {
    return (
      <div
        aria-label={t`Agent turn in progress`}
        className={cn("opacity-25", className)}
        data-testid="turn-liveness-indicator"
        role="status"
      >
        <BrandMark
          className="w-6"
          fallback={
            <FuzzyLogo
              ariaLabel={t`Agent turn in progress`}
              className="text-foreground"
              fuzz={fuzz}
              loop
              loopRestSeconds={2}
            />
          }
          motion
        />
      </div>
    );
  }

  return (
    <div
      aria-label={t`Agent turn in progress`}
      className={cn("flex items-center gap-1.5 opacity-25", className)}
      data-testid="turn-liveness-indicator"
      role="status"
    >
      {MARKS.map((mark, index) => (
        <motion.div
          animate={{
            opacity: [0, 1, 1, 0],
            y: [4, 0, -1, -4],
          }}
          key={mark}
          transition={{
            delay: index * STAGGER_SECONDS,
            duration: CYCLE_SECONDS,
            ease: "easeInOut",
            repeat: Number.POSITIVE_INFINITY,
            times: [0, 0.3, 0.7, 1],
          }}
        >
          <BrandMark
            className="w-5"
            fallback={
              <FuzzyLogo
                ariaLabel=""
                className="w-5! text-foreground"
                fuzz={fuzz}
                pulse={false}
              />
            }
          />
        </motion.div>
      ))}
    </div>
  );
}
