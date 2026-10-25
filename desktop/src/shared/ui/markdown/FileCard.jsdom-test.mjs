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

  // Both actions the spec requires for this case are present and wired. A
  // .docx is in the safe tier, so the hand-over needs no confirmation.
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
    userConfirmed: false,
  });
  assert.equal(
    byTestId("file-preview-open-confirm"),
    null,
    "a safe type must not be put behind a dialog",
  );
});

test("an unrecognised type is not handed over until the user confirms", async () => {
  responses.open_file_in_default_app = () => null;

  await mount({
    filename: "drawings.zip",
    mime: "application/zip",
    size: 4096,
  });
  await click(byTestId("file-card-open"));
  await click(byTestId("file-preview-open-externally"));

  // The click opens the question, and nothing else.
  assert.ok(byTestId("file-preview-open-confirm"), "the dialog must be shown");
  assert.deepEqual(
    commandNames(),
    [],
    "nothing may be written or opened before the user answers",
  );

  await click(byTestId("file-preview-open-cancel"));
  assert.deepEqual(commandNames(), [], "Cancel must leave the file alone");

  await click(byTestId("file-preview-open-externally"));
  await click(byTestId("file-preview-open-confirmed"));
  assert.deepEqual(commandNames(), ["open_file_in_default_app"]);
  assert.deepEqual(invocations[0].payload, {
    url: HREF,
    filename: "drawings.zip",
    userConfirmed: true,
  });
});

test("a script type is not offered to the OS at all", async () => {
  // The case this tier exists for: a .bat is text, so the sniffed MIME is
  // application/octet-stream and every content check upstream passes it.
  responses.download_file = () => true;

  await mount({
    filename: "invoice.pdf.bat",
    mime: "application/octet-stream",
    size: 512,
  });
  await click(byTestId("file-card-open"));

  assert.ok(byTestId("file-preview-unsupported"));
  assert.equal(
    byTestId("file-preview-open-externally"),
    null,
    "there must be no control that hands a script to the OS",
  );
  assert.match(
    byTestId("file-preview-unsupported").textContent,
    /will not pass this file to another application/,
    "the notice must say why the action is missing, not just omit it",
  );

  // Download is still the way out, and still works.
  await click(byTestId("file-preview-download"));
  assert.deepEqual(commandNames(), ["download_file"]);
});

test("the image viewer applies the same tiers as the document dialog", async () => {
  // The image branch is a different surface — the existing lightbox, not the
  // preview dialog — and it renders its own copy of the actions. A gate that
  // only held in one of them would be no gate: a `.jfif` or an image with a
  // deceptive name reaches this path.
  const png = new ArrayBuffer(8);
  responses.fetch_preview_bytes = () => png;
  responses.open_file_in_default_app = () => null;

  await mount({ filename: "scan.jfif", mime: "image/png", size: 1024 });
  await click(byTestId("file-card-open"));
  assert.ok(byTestId("file-preview-image"), "the image must still render");

  // An unrecognised extension asks first, here too.
  await click(byTestId("file-preview-open-externally"));
  assert.ok(byTestId("file-preview-open-confirm"), "the dialog must be shown");
  assert.ok(
    !commandNames().includes("open_file_in_default_app"),
    "nothing may be handed over before the user answers",
  );
  await click(byTestId("file-preview-open-confirmed"));
  assert.deepEqual(invocations.at(-1), {
    command: "open_file_in_default_app",
    payload: { url: HREF, filename: "scan.jfif", userConfirmed: true },
  });
});

test("a refused type explains itself in the image viewer too", async () => {
  // Here the file IS being shown, so there is no "cannot be previewed" notice
  // to carry the reason — without its own copy the action would just vanish.
  const png = new ArrayBuffer(8);
  responses.fetch_preview_bytes = () => png;

  await mount({ filename: "logo.png.hta", mime: "image/png", size: 1024 });
  await click(byTestId("file-card-open"));

  assert.equal(
    byTestId("file-preview-open-externally"),
    null,
    "a refused type must not be offered from the image viewer either",
  );
  assert.match(
    byTestId("file-preview-external-refused").textContent,
    /will not pass this file to another application/,
  );
});

test("a deceptive name is classified by the extension the OS would use", async () => {
  // `.pdf` in the middle of the name must not buy the safe tier, and a
  // trailing dot must not hide the real extension: Win32 strips it.
  for (const filename of ["invoice.pdf.exe", "setup.exe."]) {
    await mount({ filename, mime: "application/octet-stream" });
    await click(byTestId("file-card-open"));
    assert.equal(
      byTestId("file-preview-open-externally"),
      null,
      `${filename} must not offer an external open`,
    );
    await act(async () => root.unmount());
    root = null;
    container?.remove();
    container = null;
  }
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
