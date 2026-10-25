/**
 * The names the audio attachment row puts on screen and into the a11y tree.
 *
 * Both of them are sr-only or an `aria-label`, so nothing here is visible and
 * nothing here is covered by looking at the app — which is exactly why a
 * spoofed name survived in this component after the file card and the preview
 * dialog were fixed.
 *
 * Playback is not covered: jsdom has no `AudioContext` and no media element
 * that loads, so the waveform decode always fails and the row renders its
 * error branch. The assertions below are about the name, which the row derives
 * before any of that.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

/** Commands the row invoked, in order, with their payloads. */
let invocations = [];
/** Per-command responses; a function may return a value or throw. */
let responses = {};

const tauriMock = {
  invoke(command, payload) {
    invocations.push({ command, payload });
    const responder = responses[command];
    if (!responder) {
      return Promise.reject(new Error(`unmocked Tauri command: ${command}`));
    }
    try {
      return Promise.resolve(responder(payload));
    } catch (error) {
      return Promise.reject(error);
    }
  },
  transformCallback() {
    return Math.random();
  },
};
globalThis.__TAURI_INTERNALS__ = tauriMock;
globalThis.window.__TAURI_INTERNALS__ = tauriMock;

/** jsdom ships neither observer; the row constructs a ResizeObserver eagerly. */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = NoopObserver;
globalThis.window.ResizeObserver = NoopObserver;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AudioMessageAttachment } = await import("./AudioMessageAttachment.tsx");

const HREF = `https://relay.example.test/media/${"a".repeat(64)}.mp3`;
const DOWNLOAD_URL = HREF;

let container = null;
let root = null;

beforeEach(() => {
  invocations = [];
  responses = {};
  // The row fetches its own bytes to build a waveform. Refusing keeps the
  // decode out of the test; the row handles it as a waveform error.
  responses.fetch_media_bytes = () => {
    throw new Error("no media in this suite");
  };
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mount(props) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(AudioMessageAttachment, {
        href: HREF,
        downloadUrl: DOWNLOAD_URL,
        duration: 12,
        ...props,
      }),
    ),
  );
}

function title() {
  return document.querySelector("[data-slot='attachment-title']");
}

function downloadControl() {
  return [...document.querySelectorAll("[aria-label]")].find((element) =>
    element.getAttribute("aria-label").startsWith("Download "),
  );
}

test("an ordinary name is shown as it was sent", async () => {
  await mount({ filename: "standup.mp3" });

  assert.equal(title().textContent, "standup.mp3");
  assert.equal(
    downloadControl().getAttribute("aria-label"),
    "Download standup.mp3",
  );
});

test("a spoofed name is sanitized in the title and the download label", async () => {
  // U+202E reverses the text that follows it: the raw name renders — and is
  // spoken — as `invoice exe.mp3`, so both the eye and a screen reader get a
  // different file than the one on the other end of the download.
  await mount({ filename: "invoice‮3pm.exe" });

  const shown = title().textContent;
  const label = downloadControl().getAttribute("aria-label");
  assert.equal(shown, "invoice3pm.exe");
  assert.equal(label, "Download invoice3pm.exe");
  for (const text of [shown, label]) {
    assert.ok(
      !/\p{Cf}/u.test(text),
      `no rendered name may carry a format character: ${JSON.stringify(text)}`,
    );
  }
});

test("the audio row agrees with the file card about the same name", async () => {
  // Two names for one file is its own deception. Both derive the written name
  // from the same function, so this fails if either side stops.
  const { externalOpenWrittenName } = await import(
    "@/shared/lib/externalOpenPolicy"
  );
  const filename = "notes‎.docx.hta";

  await mount({ filename });

  assert.equal(title().textContent, externalOpenWrittenName(filename));
});

test("the sender's raw name still goes over IPC", async () => {
  // The backend re-derives its own name and decides what gets written. Sending
  // the display string instead would make this component the thing that picks
  // the bytes' destination — and would mean the two halves disagree about
  // which file was asked for.
  responses.download_file = () => true;
  const filename = "invoice‮3pm.exe";

  await mount({ filename });
  await act(async () => {
    downloadControl().dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });

  assert.deepEqual(
    invocations.filter((invocation) => invocation.command === "download_file"),
    [{ command: "download_file", payload: { filename, url: DOWNLOAD_URL } }],
  );
});
