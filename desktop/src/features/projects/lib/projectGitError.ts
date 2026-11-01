import { t } from "@lingui/core/macro";
import type { ProjectRepoUnavailableReason } from "./projectRepoAvailability";
import { BRAND } from "@/shared/branding/brand";

const { productName } = BRAND;

export type ProjectGitErrorPresentation = {
  title: string;
  description: string;
};

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  return typeof error === "string" ? error.toLowerCase() : "";
}

function isGitHubUrl(cloneUrl: string | null | undefined) {
  try {
    return new URL(cloneUrl ?? "").hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

export function projectCloneErrorPresentation(
  error: unknown,
  cloneUrl?: string | null,
  unavailableReason?: ProjectRepoUnavailableReason,
): ProjectGitErrorPresentation {
  const message = errorText(error);
  const github = isGitHubUrl(cloneUrl);

  if (unavailableReason === "access") {
    return {
      title: t`Repository access restricted`,
      description: t`You need access to the repository’s channel before you can clone it.`,
    };
  }
  if (
    /\b(?:401|403)\b|authenticat|authoriz|permission denied|access denied|ssh certificate/.test(
      message,
    )
  ) {
    return {
      title: t`Repository access required`,
      description: github
        ? t`This repository requires GitHub authentication. ${productName} currently clones public GitHub repositories without credentials.`
        : t`${productName} could not authenticate with this repository. Check your access and try again.`,
    };
  }
  if (/\b404\b|repository not found|repository does not exist/.test(message)) {
    return {
      title: t`Repository not found`,
      description: t`Check that the repository link is correct and that the repository still exists.`,
    };
  }
  if (
    /timed? out|could not resolve host|failed to connect|connection (?:refused|reset)|network is unreachable|offline/.test(
      message,
    )
  ) {
    return {
      title: t`Couldn’t reach the repository`,
      description: t`Check your connection and try cloning again.`,
    };
  }
  if (
    /already exists and is not an empty directory|destination path .* exists/.test(
      message,
    )
  ) {
    return {
      title: t`Local folder already exists`,
      description: t`Choose a different repositories directory or remove the existing checkout.`,
    };
  }
  return {
    title: t`Couldn’t clone repository`,
    description: github
      ? t`Try again, or open the repository on GitHub for more information.`
      : t`Try again. If the problem continues, contact the repository owner.`,
  };
}
