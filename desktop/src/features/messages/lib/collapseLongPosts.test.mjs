import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLAPSED_POST_LINES,
  isCollapsiblePost,
  shouldOpenThreadFromPostClick,
} from "./collapseLongPosts.ts";

/**
 * A minimal `Element` stand-in whose `closest` walks a real parent chain.
 *
 * `instanceof Element` is the production guard, so the test needs something
 * that satisfies it. jsdom is not loaded in this phase, so the global is
 * defined here — and the chain is real rather than stubbed, because the whole
 * point of `closest` is that a click on a `<span>` inside an `<a>` counts as
 * a click on the link.
 */
class FakeElement {
  constructor(tag, attributes = {}, parent = null) {
    this.tag = tag;
    this.attributes = attributes;
    this.parent = parent;
  }

  matchesOne(selector) {
    const attribute = selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
      const [, name, value] = attribute;
      if (!(name in this.attributes)) return false;
      return value === undefined || this.attributes[name] === value;
    }
    const tagWithAttribute = selector.match(/^([a-z]+)\[([a-z-]+)\]$/);
    if (tagWithAttribute) {
      const [, tag, name] = tagWithAttribute;
      return this.tag === tag && name in this.attributes;
    }
    if (selector === "[contenteditable]:not([contenteditable=false])") {
      return (
        "contenteditable" in this.attributes &&
        this.attributes.contenteditable !== "false"
      );
    }
    return this.tag === selector;
  }

  closest(selector) {
    const selectors = selector.split(",");
    let node = this;
    while (node) {
      if (selectors.some((one) => node.matchesOne(one.trim()))) return node;
      node = node.parent;
    }
    return null;
  }
}

globalThis.Element = FakeElement;

const PLAIN_CLICK = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

function clickOn(target) {
  return { ...PLAIN_CLICK, target };
}

const NO_SELECTION = { isCollapsed: true, toString: () => "" };

test("a plain click on the post's own text opens the thread", () => {
  const paragraph = new FakeElement("p");
  assert.equal(
    shouldOpenThreadFromPostClick(clickOn(paragraph), NO_SELECTION),
    true,
  );
  // And with no selection object at all — `window.getSelection()` returns
  // null in some embedding contexts, and a crash there would take the whole
  // row's click handler with it.
  assert.equal(shouldOpenThreadFromPostClick(clickOn(paragraph), null), true);
});

test("a click on anything operable is left to that thing", () => {
  // The requirement was "links, reactions and buttons keep working". Each of
  // these is one of them, and the span cases are the realistic ones: nobody
  // clicks the `<a>` element, they click the text inside it.
  const operable = [
    new FakeElement("a", { href: "https://example.test" }),
    new FakeElement("button"),
    new FakeElement("input"),
    new FakeElement("textarea"),
    new FakeElement("select"),
    new FakeElement("label"),
    new FakeElement("summary"),
    new FakeElement("video"),
    new FakeElement("audio"),
    new FakeElement("div", { role: "button" }),
    new FakeElement("div", { role: "menuitem" }),
    new FakeElement("div", { role: "switch" }),
    new FakeElement("div", { role: "tab" }),
    new FakeElement("div", { role: "link" }),
    new FakeElement("div", { role: "checkbox" }),
    new FakeElement("div", { role: "textbox" }),
    new FakeElement("div", { contenteditable: "true" }),
    new FakeElement("div", { "data-no-thread-open": "" }),
  ];
  for (const element of operable) {
    assert.equal(
      shouldOpenThreadFromPostClick(clickOn(element), NO_SELECTION),
      false,
      `a click on <${element.tag} ${JSON.stringify(element.attributes)}> must not open the thread`,
    );
    const inner = new FakeElement("span", {}, element);
    assert.equal(
      shouldOpenThreadFromPostClick(clickOn(inner), NO_SELECTION),
      false,
      `a click on text inside <${element.tag}> must not open the thread either`,
    );
  }
});

test("contenteditable=false is content, not an editor", () => {
  // Markdown renderers set it on code blocks. Treating it as operable would
  // make a code block the one part of a post that cannot be clicked.
  const codeBlock = new FakeElement("div", { contenteditable: "false" });
  assert.equal(
    shouldOpenThreadFromPostClick(clickOn(codeBlock), NO_SELECTION),
    true,
  );
});

test("a modified or non-primary click is left alone", () => {
  // Each of these already means something: Cmd/Ctrl and middle-click open in
  // a new window, Shift extends a selection, Alt is a platform modifier.
  // Swallowing them takes an action away and gives back one nobody asked for.
  const paragraph = new FakeElement("p");
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    assert.equal(
      shouldOpenThreadFromPostClick(
        { ...clickOn(paragraph), [modifier]: true },
        NO_SELECTION,
      ),
      false,
      `${modifier} must be left to the browser`,
    );
  }
  for (const button of [1, 2]) {
    assert.equal(
      shouldOpenThreadFromPostClick(
        { ...clickOn(paragraph), button },
        NO_SELECTION,
      ),
      false,
      `mouse button ${button} must not open the thread`,
    );
  }
});

test("finishing a text selection does not open the thread", () => {
  // Dragging across three lines of a post to copy them ends in a click on the
  // post. Opening the thread there throws the selection away — and because
  // the thread shows the same text, it looks like the app ate it.
  const paragraph = new FakeElement("p");
  assert.equal(
    shouldOpenThreadFromPostClick(clickOn(paragraph), {
      isCollapsed: false,
      toString: () => "three selected words",
    }),
    false,
  );
  // A collapsed selection is a caret, not a selection: still a plain click.
  assert.equal(
    shouldOpenThreadFromPostClick(clickOn(paragraph), {
      isCollapsed: true,
      toString: () => "",
    }),
    true,
  );
  // And an empty-but-uncollapsed selection — which Safari reports after a
  // click inside an element with `user-select: none` — is not a selection
  // worth protecting.
  assert.equal(
    shouldOpenThreadFromPostClick(clickOn(paragraph), {
      isCollapsed: false,
      toString: () => "",
    }),
    true,
  );
});

test("only settled top-level posts collapse", () => {
  assert.equal(isCollapsiblePost({ id: "a" }), true);
  assert.equal(isCollapsiblePost({ id: "a", depth: 0 }), true);
  // A thread reply is already inside the thread; collapsing it would hide
  // text behind a click that opens the pane the reader is in.
  assert.equal(isCollapsiblePost({ id: "a", depth: 1 }), false);
  assert.equal(isCollapsiblePost({ id: "a", depth: 4 }), false);
  // A pending message has no durable id for a thread to key on, and its text
  // is what its author is watching to confirm the send worked.
  assert.equal(isCollapsiblePost({ id: "a", pending: true }), false);
  assert.equal(isCollapsiblePost({ id: "a", depth: 0, pending: true }), false);
});

test("the line budget is a line count", () => {
  // Named rather than inlined so the component, the CSS custom property it
  // sets and this assertion are all the same number. The value is Ian's
  // call — "about 6 lines of body text".
  assert.equal(COLLAPSED_POST_LINES, 6);
  assert.equal(Number.isInteger(COLLAPSED_POST_LINES), true);
});
