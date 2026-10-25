import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Serve pdf.js's out-of-bundle data files at a stable, unhashed URL prefix.
 *
 * pdf.js builds these URLs itself by concatenation — `${cMapUrl}Adobe-Japan1-UCS2.bcmap`,
 * `${standardFontDataUrl}FoxitSans.pfb`, `${wasmUrl}openjpeg.wasm` — so they
 * cannot go through Vite's normal asset pipeline, which renames every file it
 * emits with a content hash. They also cannot be committed to `public/`:
 * that would put ~4 MB of generated binaries from `node_modules` in the repo,
 * where they would silently drift from the installed pdf.js version.
 *
 * So they are copied straight out of the installed package, under
 * `/pdfjs/<dir>/`, in both dev (a middleware) and build (emitted assets).
 *
 * Without these files a PDF still renders, but: non-embedded standard fonts
 * fall back to system fonts, CJK text with non-embedded CID fonts loses its
 * glyphs, and JPEG 2000 / JBIG2 images (common in scans) fail to decode and
 * leave blank regions. Those are quiet, document-specific failures — which is
 * exactly the kind that reaches a user and not a test.
 */

const URL_PREFIX = "/pdfjs/";

/** The pdf.js subdirectories the renderer points at. Order is not meaningful. */
const ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

const MIME_BY_EXTENSION = new Map([
  [".wasm", "application/wasm"],
  [".bcmap", "application/octet-stream"],
  [".pfb", "application/octet-stream"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".icc", "application/octet-stream"],
]);

/**
 * Absolute path of the installed `pdfjs-dist` package root.
 *
 * Resolved via its `package.json`, not its entrypoint: `pdfjs-dist`'s `main` is
 * `build/pdf.mjs`, so resolving the bare name and taking its directory lands in
 * `build/` — one level below the data directories.
 */
function resolvePdfjsRoot(importerUrl) {
  const require = createRequire(importerUrl);
  return path.dirname(require.resolve("pdfjs-dist/package.json"));
}

/** Every file under `dir`, as paths relative to `dir`. */
async function listFilesRecursively(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await listFilesRecursively(entryPath)) {
        files.push(path.join(entry.name, nested));
      }
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

/**
 * Resolve a request path under {@link URL_PREFIX} to a file inside the pdf.js
 * package, or `null` if it escapes the allowed directories.
 *
 * Exported for unit tests: the containment check is the only security-relevant
 * line in a dev-only middleware, and it is worth pinning.
 */
export function resolveAssetPath(pdfjsRoot, requestPath) {
  if (!requestPath.startsWith(URL_PREFIX)) return null;
  const relative = decodeURIComponent(requestPath.slice(URL_PREFIX.length));
  const [topLevel] = relative.split("/");
  if (!ASSET_DIRS.includes(topLevel)) return null;

  const resolved = path.resolve(pdfjsRoot, relative);
  const allowedRoot = path.resolve(pdfjsRoot, topLevel) + path.sep;
  return resolved.startsWith(allowedRoot) ? resolved : null;
}

/** Vite plugin copying pdf.js's cmaps, standard fonts, wasm, and ICC profiles. */
export function pdfjsAssets() {
  const pdfjsRoot = resolvePdfjsRoot(import.meta.url);

  return {
    name: "buzz:pdfjs-assets",

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = (req.url ?? "").split("?")[0];
        const filePath = resolveAssetPath(pdfjsRoot, requestPath);
        if (!filePath) return next();
        stat(filePath).then(
          (stats) => {
            if (!stats.isFile()) return next();
            const mime =
              MIME_BY_EXTENSION.get(path.extname(filePath)) ??
              "application/octet-stream";
            res.setHeader("content-type", mime);
            createReadStream(filePath).pipe(res);
          },
          () => next(),
        );
      });
    },

    async generateBundle() {
      for (const dir of ASSET_DIRS) {
        const absoluteDir = path.join(pdfjsRoot, dir);
        let names;
        try {
          names = await listFilesRecursively(absoluteDir);
        } catch (error) {
          // A missing directory means the installed pdf.js changed shape.
          // Fail the build rather than shipping a renderer that 404s on
          // fonts at runtime, where nobody is watching.
          throw new Error(
            `pdfjs-dist is missing "${dir}" (looked in ${absoluteDir}): ${error.message}`,
          );
        }
        for (const name of names) {
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${dir}/${name.split(path.sep).join("/")}`,
            source: await readFile(path.join(absoluteDir, name)),
          });
        }
      }
    },
  };
}
