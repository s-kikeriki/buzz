import * as React from "react";

import {
  isWelcomeKickoffStageExiting,
  type WelcomeKickoffStagePhase,
} from "@/features/onboarding/useWelcomeKickoffStage";
import { cn } from "@/shared/lib/cn";

type StageCharacter = {
  name: string;
  animationUrl: string;
};

/**
 * Empty on the kikeriki fork, and the APNGs behind it are deleted.
 *
 * Fizz, Honey and Pollen were three animated Buzz bees, and no build of ours
 * ships a bee. `WELCOME_TEAM_ENABLED` already stops this component from
 * mounting at all — this is the second lock, so that re-enabling the welcome
 * team is a decision about agents rather than an accidental way to put the
 * bees back on a client's first screen.
 *
 * The component is kept whole rather than deleted, matching how
 * `welcomeGuide.ts` keeps the provisioning it will not run: the stage's phase
 * machine, its exit animation and its tests all still hold, so the feature is
 * one list away from working if upstream ever wants it back.
 */
const STAGE_CHARACTERS: readonly StageCharacter[] = [];

const STAGE_EXIT_ANIMATION = "motion-kickoff-stage-exit";

/**
 * The welcome team characters standing on top of the Welcome composer banner
 * while the team is being set up. Positioned relative to the banner wrapper
 * (`bottom-full` = feet on the banner's top edge) and purely decorative —
 * the banner's own copy carries the setup status for screen readers.
 *
 * Placeholder choreography: staggered rise-from-below entrance per character
 * (CSS `motion-kickoff-character-enter`, delay via `--stagger-index`), whole
 * row crossfades out on either resolution — the first agent message landing,
 * or the wait timing out. The characters must not linger after a timeout: a
 * stage that stays up implies a team is still coming when none is.
 */
export function WelcomeKickoffStage({
  onExitComplete,
  phase,
}: {
  onExitComplete: () => void;
  phase: WelcomeKickoffStagePhase;
}) {
  const handleAnimationEnd = React.useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (event.animationName === STAGE_EXIT_ANIMATION) {
        onExitComplete();
      }
    },
    [onExitComplete],
  );

  if (phase === "hidden" || phase === "done") return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-full left-10 z-10 flex items-end gap-4",
        isWelcomeKickoffStageExiting(phase) && "motion-kickoff-stage-exit",
      )}
      data-phase={phase}
      data-testid="welcome-kickoff-stage"
      onAnimationEnd={handleAnimationEnd}
    >
      {STAGE_CHARACTERS.map((character, index) => (
        <img
          alt=""
          className="motion-kickoff-character-enter h-16 w-16 object-contain"
          data-testid={`welcome-kickoff-stage-${character.name.toLowerCase()}`}
          key={character.name}
          src={character.animationUrl}
          style={{ "--stagger-index": index } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
