/**
 * The file card's two click targets, as the app mounts them.
 *
 * `filePreview.test.mjs` proves the classification and nothing else; this
 * covers the wiring between that answer and the DOM, which is where the card
 * can classify a PDF correctly and still download it, or download when the
 * user only wanted to look — the two failures that matter here.
 *
 * What this does NOT cover, deliberately: rasterising a page. pdf.js v6 needs
 * `Promise.try`, which Node 22 does not have, so pdf.js cannot be loaded in
 * this suite at all. Every case below therefore stops at the fetch boundary —
 * either before it, or on a rejection. Whether a page actually paints is
 * answered by the e2e spec and by a human opening a document.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

/** Commands the card invoked, in order, with their payloads. */
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

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FileCard } = await import("./FileCard.tsx");

const HREF = `https://relay.example.test/media/${"a".repeat(64)}.pdf`;

let container = null;
let root = null;

beforeEach(() => {
  invocations = [];
  responses = {};
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
    root.render(React.createElement(FileCard, { href: HREF, ...props })),
  );
}

/** Radix portals the dialog, so query the whole document, not the container. */
function byTestId(testId) {
  return document.querySelector(`[data-testid="${testId}"]`);
}

async function click(element) {
  assert.ok(element, "expected the element under test to be in the DOM");
  await act(async () => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function commandNames() {
  return invocations.map((invocation) => invocation.command);
}

test("clicking the card opens the preview and downloads nothing", async () => {
  // The refusal keeps pdf.js out of this suite while still proving the card
  // reached the preview fetch — and it is also the real too-large path.
  responses.fetch_preview_bytes = () => {
    throw new Error("too large to preview (max 25 MiB) — download it instead");
  };

  await mount({ filename: "report.pdf", mime: "application/pdf", size: 4096 });
  assert.equal(
    byTestId("file-preview-dialog"),
    null,
    "closed before the click",
  );

  await click(byTestId("file-card-open"));

  assert.ok(byTestId("file-preview-dialog"), "the preview dialog must open");
  assert.deepEqual(commandNames(), ["fetch_preview_bytes"]);
  assert.ok(
    !commandNames().includes("download_file"),
    "opening a preview must not download the file",
  );
});

test("the preview fetch is scoped to the classified kind and declared size", async () => {
  responses.fetch_preview_bytes = () => {
    throw new Error("nope");
  };

  await mount({ filename: "report.pdf", mime: "application/pdf", size: 4096 });
  await click(byTestId("file-card-open"));

  assert.deepEqual(invocations[0].payload, {
    url: HREF,
    kind: "pdf",
    declaredSize: 4096,
  });
});

test("a failed preview says why and offers the download instead", async () => {
  const refusal = "too large to preview (max 25 MiB) — download it instead";
  responses.fetch_preview_bytes = () => {
    throw new Error(refusal);
  };
  responses.download_file = () => true;

  await mount({ filename: "huge.pdf", mime: "application/pdf" });
  await click(byTestId("file-card-open"));

  const error = byTestId("file-preview-error");
  assert.ok(error, "the failure must be shown, not swallowed");
  assert.match(error.textContent, /too large to preview/);

  // The fallback has to actually work from inside the failed preview.
  await click(byTestId("file-preview-download"));
  assert.ok(commandNames().includes("download_file"));
});

test("Download on the card downloads without opening a preview", async () => {
  responses.download_file = () => true;

  await mount({ filename: "report.pdf", mime: "application/pdf", size: 4096 });
  await click(byTestId("file-card-download"));

  assert.deepEqual(invocations, [
    {
      command: "download_file",
      payload: { url: HREF, filename: "report.pdf" },
    },
  ]);
  assert.equal(
    byTestId("file-preview-dialog"),
    null,
    "Download must not open the preview",
  );
});

test("an unpreviewable type opens the card's information, not a fetch", async () => {
  await mount({
    filename: "minutes.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 20480,
  });
  await click(byTestId("file-card-open"));

  assert.ok(
    byTestId("file-preview-unsupported"),
    "a type we cannot render must say so",
  );
  assert.deepEqual(
    commandNames(),
    [],
    "there is nothing to fetch for a type we will not render",
  );

  // Both actions the spec requires for this case are present and wired.
  responses.download_file = () => true;
  responses.open_file_in_default_app = () => null;
  await click(byTestId("file-preview-download"));
  await click(byTestId("file-preview-open-externally"));
  assert.deepEqual(commandNames(), [
    "download_file",
    "open_file_in_default_app",
  ]);
  assert.deepEqual(invocations[1].payload, {
    url: HREF,
    filename: "minutes.docx",
  });
});

test("an image goes to the existing viewer, fetched through the same gate", async () => {
  // A PNG that reached the file card arrived with a non-image MIME, so its URL
  // was never proxy-rewritten — the bytes have to come through the command.
  const png = new ArrayBuffer(8);
  responses.fetch_preview_bytes = () => png;

  await mount({
    filename: "scan.png",
    mime: "application/octet-stream",
    size: 1024,
  });
  await click(byTestId("file-card-open"));

  assert.equal(
    byTestId("file-preview-dialog"),
    null,
    "an image must not open the document dialog",
  );
  assert.ok(byTestId("file-preview-image"), "the image viewer must render it");
  assert.deepEqual(invocations[0].payload, {
    url: HREF,
    kind: "image",
    declaredSize: 1024,
  });
});

test("the card's own controls each own exactly one accessible name", async () => {
  await mount({ filename: "report.pdf", mime: "application/pdf" });

  assert.equal(
    byTestId("file-card-open").getAttribute("aria-label"),
    "Preview report.pdf",
  );
  assert.equal(
    byTestId("file-card-download").getAttribute("aria-label"),
    "Download report.pdf",
  );
  // A wrapping button would make Download a nested interactive element and
  // give the screen reader two overlapping stops for one row.
  assert.equal(
    byTestId("file-card-open").querySelector("button"),
    null,
    "the card's click target must not contain another control",
  );
});
