/**
 * What the collapsed post body does with a height it cannot know in advance.
 *
 * The clamp itself is CSS and jsdom computes no layout, so these assertions
 * are about the part that is JavaScript: deciding *whether* the content
 * overflows, and what appears once it does. `scrollHeight` and `clientHeight`
 * are both 0 in jsdom, so each case defines them explicitly — which is also
 * the only way to test the image-loads-late path at all.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

/** Observers created by the component, so a test can fire one by hand. */
let observers = [];

class RecordingResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    observers.push(this);
  }
  observe(target) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}
globalThis.ResizeObserver = RecordingResizeObserver;
globalThis.window.ResizeObserver = RecordingResizeObserver;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { i18n } = await import("@lingui/core");
const { I18nProvider } = await import("@lingui/react");
const { CollapsedPostBody } = await import("./CollapsedPostBody.tsx");

// The affordance's label goes through `<Trans>`, which throws without a
// provider — with an error that blames a duplicate `@lingui/react` install
// and names neither the component nor the missing provider. Empty messages
// make every id fall back to its source string, which is the English the
// assertions below read.
i18n.loadAndActivate({ locale: "en", messages: {} });

function withI18n(element) {
  return React.createElement(I18nProvider, { i18n }, element);
}
const { COLLAPSED_POST_LINES } = await import(
  "@/features/messages/lib/collapseLongPosts.ts"
);

let container = null;
let root = null;

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
  observers = [];
});

/**
 * Pin the two heights the component compares.
 *
 * jsdom reports 0 for both, so without this every post reads as "fits" and
 * the test could never see a fade. Defined on the prototype so the element
 * the component creates picks them up whenever it is created.
 */
function setHeights({ scrollHeight, clientHeight }) {
  Object.defineProperty(
    globalThis.window.HTMLElement.prototype,
    "scrollHeight",
    {
      configurable: true,
      get() {
        return this.dataset.collapsedPost !== undefined ? scrollHeight : 0;
      },
    },
  );
  Object.defineProperty(
    globalThis.window.HTMLElement.prototype,
    "clientHeight",
    {
      configurable: true,
      get() {
        return this.dataset.collapsedPost !== undefined ? clientHeight : 0;
      },
    },
  );
}

async function mount({ onOpenThread = () => {}, children = "body text" } = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      withI18n(
        React.createElement(CollapsedPostBody, { onOpenThread }, children),
      ),
    ),
  );
  return container.querySelector('[data-testid="collapsed-post-body"]');
}

test("a post that fits gets no fade and no extra control", async () => {
  setHeights({ scrollHeight: 80, clientHeight: 80 });
  const body = await mount();

  assert.equal(body.dataset.overflowing, undefined);
  assert.ok(!body.className.includes("collapsed-post-fade"));
  assert.equal(
    container.querySelector('[data-testid="collapsed-post-open-thread"]'),
    null,
    "a post with nothing hidden must not offer to show the rest",
  );
  // The clamp is applied either way — measuring first and clamping second
  // would render every long post at full height for a frame.
  assert.equal(
    body.style.getPropertyValue("--collapsed-post-lines"),
    String(COLLAPSED_POST_LINES),
  );
  assert.ok(body.className.includes("overflow-hidden"));
});

test("a post that overflows fades and offers the thread", async () => {
  setHeights({ scrollHeight: 400, clientHeight: 120 });
  const body = await mount();

  assert.equal(body.dataset.overflowing, "");
  assert.ok(body.className.includes("collapsed-post-fade"));
  const control = container.querySelector(
    '[data-testid="collapsed-post-open-thread"]',
  );
  assert.ok(control, "an overflowing post must offer a way to read the rest");
  assert.equal(control.tagName, "BUTTON");
  assert.equal(control.type, "button");
  assert.ok(
    control.textContent.trim().length > 0,
    "the control must have an accessible name, not be an empty hit target",
  );
  // Present is not the same as reachable, and this is the whole reason the
  // control exists: the pointer affordance is the post itself, so everyone
  // not using a pointer has only this. A break test that added `aria-hidden`
  // passed every assertion above.
  assert.equal(
    control.getAttribute("aria-hidden"),
    null,
    "the affordance must stay in the accessibility tree",
  );
  assert.equal(
    control.hasAttribute("inert"),
    false,
    "the affordance must stay operable",
  );
  assert.equal(
    control.getAttribute("tabindex"),
    null,
    "the affordance must stay in the tab order",
  );
  assert.equal(control.disabled, false);
});

test("the keyboard control opens the thread", async () => {
  // The pointer path is a click on the post, handled a layer up and tested in
  // `collapseLongPosts.test.mjs`. This is the other modality: a control that
  // is hidden until focused still has to *do* something.
  setHeights({ scrollHeight: 400, clientHeight: 120 });
  let opened = 0;
  await mount({ onOpenThread: () => (opened += 1) });

  const control = container.querySelector(
    '[data-testid="collapsed-post-open-thread"]',
  );
  await act(async () => {
    control.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(opened, 1);
});

test("content that grows after mount still gets a fade", async () => {
  // The post this feature is for is the one with an image in it, and an image
  // has no height until it loads. A measurement on mount alone concludes the
  // post is short, so the fade never appears and the post silently loses its
  // bottom half to `overflow: hidden` with nothing to say there is more.
  setHeights({ scrollHeight: 80, clientHeight: 80 });
  const body = await mount();
  assert.equal(body.dataset.overflowing, undefined);

  setHeights({ scrollHeight: 600, clientHeight: 120 });
  assert.equal(observers.length, 1, "exactly one observer per body");
  await act(async () => {
    observers[0].callback();
  });

  assert.equal(body.dataset.overflowing, "");
  assert.ok(
    container.querySelector('[data-testid="collapsed-post-open-thread"]'),
  );
});

test("the observer watches both the box and its contents, and is released", async () => {
  // Two targets answer different questions: the container's box changes when
  // the pane resizes, the content wrapper's when an image loads inside a box
  // that did not move. Watching only the container misses the second.
  setHeights({ scrollHeight: 400, clientHeight: 120 });
  const body = await mount();

  assert.equal(observers.length, 1);
  assert.equal(observers[0].targets.length, 2);
  assert.ok(observers[0].targets.includes(body));
  assert.ok(observers[0].targets.includes(body.firstElementChild));

  await act(async () => root.unmount());
  root = null;
  assert.equal(
    observers[0].disconnected,
    true,
    "an observer left connected leaks one per message in a scrolling timeline",
  );
});

test("a sub-pixel difference is not overflow", async () => {
  // The line-height is a `calc`, so a post of exactly six lines lands a
  // fraction of a pixel either side of the clamp. Without the tolerance the
  // fade flickers on and off as the pane resizes.
  setHeights({ scrollHeight: 120.4, clientHeight: 120 });
  const body = await mount();
  assert.equal(body.dataset.overflowing, undefined);

  setHeights({ scrollHeight: 122, clientHeight: 120 });
  await act(async () => {
    observers[0].callback();
  });
  assert.equal(body.dataset.overflowing, "");
});
