//! Lifetime of the temporary files written for "Open in default app".
//!
//! Handing an attachment to another application requires a real file, so this
//! is the one preview-side path that writes to disk. The file cannot be deleted
//! when the command returns — the external application is still starting and
//! has not read it yet — but it must not be abandoned either. A directory that
//! is only ever created accumulates every document a user has ever opened, in
//! `%TEMP%` or `/tmp`, indefinitely.
//!
//! So each open gets its own directory and the directory is remembered. Three
//! things then remove it:
//!
//! - **App exit** removes every directory this run created, by path.
//! - **Startup** sweeps anything a previous run left behind, which is what
//!   catches a crash or a kill — exit never ran, so nothing else would.
//! - **Before each new open**, the same sweep runs again, so a session that
//!   lasts weeks still retires its predecessors' leftovers and a removal that
//!   failed earlier gets retried.
//!
//! ## Why deleting these is safe
//!
//! Deleting a file another application still has open is how a well-meant
//! cleanup destroys a user's work: quit Buzz while Word holds
//! `buzz-open-XXXX/minutes.docx`, remove the directory, and the next Save has
//! nowhere to write. POSIX will not even refuse the unlink.
//!
//! The file is therefore sealed **read-only** before it is handed over (see
//! [`seal_external_open_file`]). An application that cannot save in place
//! sends the user to Save As, where they choose a real location — which is the
//! right destination for a stranger's attachment anyway. So no temporary copy
//! can hold edits that only exist there, and removing one can cost at most a
//! re-open.
//!
//! Two further guards on the sweep, both about not removing a directory that is
//! still in use: directories this run created are excluded from it entirely
//! (they are removed by path at exit, whatever their age), and a foreign
//! directory has to be older than [`STALE_AFTER`] — a second instance's open
//! directory is minutes old, not a day.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};

/// Prefix every directory this module creates shares.
///
/// The sweep identifies its own leftovers by it, so it must stay distinctive
/// enough that nothing else in a shared temporary directory matches.
const TEMP_DIR_PREFIX: &str = "buzz-open-";

/// How old an orphaned directory must be before the sweep removes it.
///
/// Long enough that a directory a *concurrently running* second instance just
/// created is never in scope, short enough that a crash's leftovers do not
/// outlive the next day's use.
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// Directories created by this run, pending removal at exit.
///
/// Poisoning is recovered rather than propagated. The payload is a list of
/// paths: a panic elsewhere cannot leave it in a state a push or a drain would
/// misread, and treating "unlocked" as a reason to skip cleanup would turn an
/// unrelated panic into a permanent leak.
fn registry() -> std::sync::MutexGuard<'static, Vec<PathBuf>> {
    static OPENED_DIRS: OnceLock<Mutex<Vec<PathBuf>>> = OnceLock::new();
    OPENED_DIRS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

/// Remove temporary directories a previous run left behind.
///
/// Called once from the Tauri `setup` hook. Exit cleanup does not run after a
/// crash or a kill, so without this the leftovers from one would stay until the
/// user happened to open another attachment — or forever, if they never did.
pub fn sweep_external_open_temp_dirs_at_startup() {
    sweep_stale_dirs(&std::env::temp_dir(), SystemTime::now(), STALE_AFTER);
}

/// Create a fresh temporary directory for one external open, and remember it.
///
/// One directory per open, so two opens of the same filename cannot collide and
/// nothing lands next to the user's own documents. Sweeps first: the moment
/// before adding one is the natural moment to retire the ones that are done,
/// and it is the only one a session that never ends ever reaches.
pub(super) fn create_external_open_dir() -> Result<PathBuf, String> {
    let root = std::env::temp_dir();
    sweep_stale_dirs(&root, SystemTime::now(), STALE_AFTER);
    create_dir_in(&root)
}

/// Write an attachment into a directory from [`create_external_open_dir`].
///
/// Still writable when it returns — the caller marks its provenance next, which
/// needs write access — and must be passed to [`seal_external_open_file`]
/// before the path is handed to another application.
pub(super) fn write_external_open_file(
    dir: &Path,
    filename: &str,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    let path = dir.join(filename);
    std::fs::write(&path, bytes).map_err(|e| format!("could not write the temporary file: {e}"))?;
    Ok(path)
}

/// Make the temporary copy read-only, the last step before it is opened.
///
/// Read-only is what makes the cleanup in this module safe rather than
/// destructive: an application that cannot write back in place sends the user
/// to Save As and a location they chose, so no copy here is ever the only home
/// of their edits. Without it, removing a directory at exit silently discards
/// whatever was typed into a document still open from it.
///
/// Failing to apply it is not "nearly fine": a writable copy is exactly the
/// case the cleanup would destroy, so the file is removed and the open refused
/// rather than handed over on an assumption that no longer holds. That is the
/// opposite trade from the provenance mark, which only reduces the OS's own
/// defences when it fails and so is best effort.
pub(super) fn seal_external_open_file(path: &Path) -> Result<(), String> {
    let mut permissions = std::fs::metadata(path)
        .map_err(|e| format!("could not read the temporary file back: {e}"))?
        .permissions();
    permissions.set_readonly(true);
    if let Err(error) = std::fs::set_permissions(path, permissions) {
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "could not make the temporary copy read-only, so it was not opened: {error}"
        ));
    }
    Ok(())
}

/// The directory-creating half, with its parent as an argument so the tests
/// never write to — or sweep — the real temporary directory.
fn create_dir_in(root: &Path) -> Result<PathBuf, String> {
    let dir = tempfile::Builder::new()
        .prefix(TEMP_DIR_PREFIX)
        .tempdir_in(root)
        .map_err(|error| format!("could not create a temporary directory: {error}"))?
        // Keep the directory past this scope: the file has to still exist when
        // the external application gets round to reading it. Removal is this
        // module's job instead of `TempDir`'s, not nobody's.
        .keep();

    registry().push(dir.clone());
    Ok(dir)
}

/// Remove every temporary directory the external-open path is responsible for.
///
/// Called from `RunEvent::Exit`: the directories this run created, by path,
/// plus a final sweep for anything a previous run left behind.
pub fn release_external_open_temp_dirs() {
    release_registered_dirs();
    sweep_stale_dirs(&std::env::temp_dir(), SystemTime::now(), STALE_AFTER);
}

/// Remove the directories this run created.
///
/// Failure to remove one is not fatal and not swallowed either: the directory
/// keeps its `buzz-open-` prefix, which *is* the retry record — a later sweep
/// picks it up once it is stale. That is the expected outcome on Windows when
/// the application that opened the file still holds it.
fn release_registered_dirs() {
    let pending = std::mem::take(&mut *registry());
    for dir in pending {
        remove_dir(&dir);
    }
}

/// Remove one directory, reporting rather than propagating a failure.
///
/// Already-gone is success: the sweep and the exit pass overlap by design.
fn remove_dir(dir: &Path) {
    // The files inside are read-only, and on Windows `remove_dir_all` will not
    // delete a read-only file — it returns PermissionDenied. Clearing the flag
    // first is what stops the measure that makes deletion *safe* from making it
    // impossible.
    //
    // Windows only. On POSIX, unlinking needs write permission on the
    // *directory*, not on the file, so a 0444 file in a directory we created
    // removes fine — and the portable `set_readonly(false)` would set every
    // write bit, briefly making a stranger's attachment world-writable in a
    // shared `/tmp`. Clippy flags that for exactly this reason.
    #[cfg(target_os = "windows")]
    clear_readonly_recursively(dir);

    match std::fs::remove_dir_all(dir) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => eprintln!(
            "buzz-desktop: could not remove {}, leaving it for the next sweep: {error}",
            dir.display(),
        ),
    }
}

/// Clear the read-only flag on everything under `path`, best effort.
///
/// Recursive rather than one level deep: nothing writes subdirectories here
/// today, but a removal that silently leaves one behind would be worse than the
/// cost of walking it.
#[cfg(target_os = "windows")]
fn clear_readonly_recursively(path: &Path) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            clear_readonly_recursively(&child);
            continue;
        }
        if let Ok(metadata) = std::fs::metadata(&child) {
            let mut permissions = metadata.permissions();
            if permissions.readonly() {
                permissions.set_readonly(false);
                let _ = std::fs::set_permissions(&child, permissions);
            }
        }
    }
}

/// Remove `buzz-open-*` directories under `root` last modified before
/// `now - stale_after`, skipping any this run created. Returns how many were
/// removed, for the tests.
///
/// `now` and `stale_after` are arguments rather than reads so the age rule is
/// testable without waiting a day or back-dating a directory.
///
/// The registry exclusion is not redundant with the age rule. Buzz is a chat
/// client that stays open for weeks: a directory opened on Monday is a day old
/// by Tuesday, and without this a Tuesday open would sweep it while the
/// application that opened Monday's document is still running. Directories this
/// run created are removed by path at exit instead, whatever their age.
fn sweep_stale_dirs(root: &Path, now: SystemTime, stale_after: Duration) -> usize {
    let Ok(entries) = std::fs::read_dir(root) else {
        return 0;
    };
    let ours: Vec<PathBuf> = registry().clone();

    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !name.starts_with(TEMP_DIR_PREFIX) {
            continue;
        }
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        if ours.contains(&path) {
            continue;
        }
        // No modification time means no evidence it is stale. Leave it: a
        // directory another instance is using must not be removed on a guess.
        let Ok(modified) = entry.metadata().and_then(|meta| meta.modified()) else {
            continue;
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age >= stale_after {
            remove_dir(&path);
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serialize the tests that touch the process-wide registry.
    ///
    /// `release_registered_dirs` drains it for the whole process, so two of
    /// these running at once would each see the other's directories vanish.
    /// Not a product concern — exit happens once — but it makes these tests
    /// flaky rather than wrong.
    fn registry_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: Mutex<()> = Mutex::new(());
        LOCK.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// A directory tree under `root` with one file in it, like a real open.
    fn make_dir(root: &Path, name: &str) -> PathBuf {
        let dir = root.join(name);
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("report.pdf"), b"%PDF-1.7\n").expect("write file");
        dir
    }

    #[test]
    fn the_sweep_removes_a_stale_directory_with_its_contents() {
        let root = tempfile::tempdir().expect("temp root");
        let stale = make_dir(root.path(), "buzz-open-abc123");

        // "Now" a day and a half after the directory was created, rather than
        // back-dating the directory, which stable Rust cannot do.
        let later = SystemTime::now() + Duration::from_secs(36 * 60 * 60);
        assert_eq!(sweep_stale_dirs(root.path(), later, STALE_AFTER), 1);
        assert!(!stale.exists(), "a stale directory must be removed");
    }

    #[test]
    fn the_sweep_leaves_a_fresh_directory_alone() {
        // This is the case that protects a second running instance: its open
        // directory is minutes old, and deleting it would pull the file out
        // from under an application that is still loading it.
        let root = tempfile::tempdir().expect("temp root");
        let fresh = make_dir(root.path(), "buzz-open-def456");

        assert_eq!(
            sweep_stale_dirs(root.path(), SystemTime::now(), STALE_AFTER),
            0,
        );
        assert!(fresh.exists(), "a directory still in use must survive");
    }

    #[test]
    fn the_sweep_only_touches_its_own_prefix() {
        let root = tempfile::tempdir().expect("temp root");
        let ours = make_dir(root.path(), "buzz-open-ghi789");
        let theirs = make_dir(root.path(), "important-user-data");
        let near_miss = make_dir(root.path(), "buzz-download-jkl012");
        let file = root.path().join("buzz-open-not-a-directory.txt");
        std::fs::write(&file, b"x").expect("write file");

        let later = SystemTime::now() + Duration::from_secs(36 * 60 * 60);
        assert_eq!(sweep_stale_dirs(root.path(), later, STALE_AFTER), 1);

        assert!(!ours.exists());
        assert!(theirs.exists(), "an unrelated directory must be untouched");
        assert!(
            near_miss.exists(),
            "a different buzz prefix is not ours to remove",
        );
        assert!(file.exists(), "a file is not a temporary open directory");
    }

    #[test]
    fn a_missing_root_is_not_an_error() {
        let root = tempfile::tempdir().expect("temp root");
        let gone = root.path().join("not-there");
        assert_eq!(sweep_stale_dirs(&gone, SystemTime::now(), STALE_AFTER), 0);
    }

    #[test]
    fn a_created_directory_is_registered_and_released() {
        let _guard = registry_guard();
        // This is the case that answers "does anything actually delete it":
        // a fresh directory is not stale, so the sweep above will never remove
        // it and the registry is the only thing that will.
        let root = tempfile::tempdir().expect("temp root");
        let dir = create_dir_in(root.path()).expect("create open dir");
        std::fs::write(dir.join("minutes.docx"), b"PK\x03\x04").expect("write file");
        assert!(dir.exists());
        assert!(
            registry().contains(&dir),
            "a created directory must be remembered for removal",
        );
        assert_eq!(
            sweep_stale_dirs(root.path(), SystemTime::now(), STALE_AFTER),
            0,
            "the sweep cannot be what removes a directory this new",
        );

        release_registered_dirs();

        assert!(!dir.exists(), "exit must remove what this run created");
        assert!(
            !registry().contains(&dir),
            "a released directory must not stay in the registry",
        );
    }

    #[test]
    fn removing_an_already_gone_directory_is_not_a_failure() {
        let root = tempfile::tempdir().expect("temp root");
        remove_dir(&root.path().join("never-existed"));
    }

    #[test]
    fn a_sealed_file_cannot_be_written_in_place() {
        // This is what makes the cleanup safe instead of destructive: no
        // application can hold unsaved edits in a copy it cannot write.
        let root = tempfile::tempdir().expect("temp root");
        let path =
            write_external_open_file(root.path(), "minutes.docx", b"PK\x03\x04").expect("write");
        assert!(
            std::fs::OpenOptions::new().write(true).open(&path).is_ok(),
            "the file must still be writable before sealing, so provenance marks can be applied",
        );

        seal_external_open_file(&path).expect("seal");

        assert!(
            std::fs::metadata(&path)
                .expect("metadata")
                .permissions()
                .readonly(),
            "a sealed copy must be read-only",
        );
        assert!(
            std::fs::OpenOptions::new().write(true).open(&path).is_err(),
            "a sealed copy must refuse an in-place write",
        );
        // And it must still be readable, or the external application has
        // nothing to open.
        assert_eq!(std::fs::read(&path).expect("read"), b"PK\x03\x04");
    }

    #[test]
    fn a_sealed_file_can_still_be_removed() {
        let _guard = registry_guard();
        // Read-only files are what `remove_dir_all` refuses on Windows, so the
        // measure that makes deletion safe could have made it impossible.
        let root = tempfile::tempdir().expect("temp root");
        let dir = create_dir_in(root.path()).expect("create open dir");
        let path = write_external_open_file(&dir, "report.pdf", b"%PDF-1.7\n").expect("write");
        seal_external_open_file(&path).expect("seal");

        release_registered_dirs();

        assert!(!dir.exists(), "a sealed copy must not survive the cleanup");
    }

    #[test]
    fn the_sweep_never_removes_a_directory_this_run_created() {
        let _guard = registry_guard();
        // The long-session case: Buzz stays open for weeks, so one of its own
        // directories is a day old while the application that opened its
        // document is still running. Age alone would sweep it.
        let root = tempfile::tempdir().expect("temp root");
        let ours = create_dir_in(root.path()).expect("create open dir");
        let foreign = make_dir(root.path(), "buzz-open-from-a-dead-run");

        let later = SystemTime::now() + Duration::from_secs(36 * 60 * 60);
        assert_eq!(sweep_stale_dirs(root.path(), later, STALE_AFTER), 1);

        assert!(
            ours.exists(),
            "a directory this run is responsible for must survive the sweep at any age",
        );
        assert!(!foreign.exists(), "a dead run's leftovers must be removed");

        release_registered_dirs();
        assert!(!ours.exists(), "and exit must then remove it");
    }
}
