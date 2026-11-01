import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { withI18n } from "@/testing/withI18n.mjs";

import { ChannelIntroBlock } from "./ChannelIntroBlock.tsx";

test("ChannelIntroBlock preserves multi-paragraph description whitespace", () => {
  const description = "First paragraph.\n\nSecond paragraph.\nThird line.";
  const html = renderToStaticMarkup(
    withI18n(
      React.createElement(ChannelIntroBlock, {
        intro: {
          // A descriptor, as `useChannelIntro` now hands it over. Written
          // out rather than built with the `msg` macro: macros are compiled
          // for `.ts`/`.tsx` only, and this spec is `.mjs`. Catalogue ids in
          // this project are the source text, so `i18n._` resolves it.
          channelKindLabel: {
            id: "regular channel",
            message: "regular channel",
          },
          channelName: "test",
          description,
        },
      }),
    ),
  );

  assert.match(html, /whitespace-pre-line/);
  assert.match(html, /First paragraph\.\n\nSecond paragraph\.\nThird line\./);
});
