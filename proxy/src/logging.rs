use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use tracing_subscriber::fmt::MakeWriter;

const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ROTATED_FILES: usize = 5;

#[derive(Clone)]
pub struct RotatingMakeWriter {
    inner: Arc<Mutex<RotatingLog>>,
}

impl RotatingMakeWriter {
    pub fn new(path: PathBuf) -> io::Result<Self> {
        Ok(Self {
            inner: Arc::new(Mutex::new(RotatingLog::new(path)?)),
        })
    }
}

impl<'a> MakeWriter<'a> for RotatingMakeWriter {
    type Writer = RotatingGuard<'a>;

    fn make_writer(&'a self) -> Self::Writer {
        RotatingGuard {
            guard: self.inner.lock().expect("log mutex poisoned"),
        }
    }
}

pub struct RotatingGuard<'a> {
    guard: MutexGuard<'a, RotatingLog>,
}

impl Write for RotatingGuard<'_> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.guard.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.guard.file.flush()
    }
}

struct RotatingLog {
    path: PathBuf,
    file: File,
    written: u64,
}

impl RotatingLog {
    fn new(path: PathBuf) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
            // Best-effort: do not fail if parent is an existing system directory such as /tmp.
            let _ = restrict_dir_permissions(parent);
        }
        let file = open_log_file(&path)?;
        let written = file.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(Self {
            path,
            file,
            written,
        })
    }

    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.written + buf.len() as u64 > MAX_LOG_BYTES {
            self.rotate()?;
        }
        let size = self.file.write(buf)?;
        self.written += size as u64;
        Ok(size)
    }

    fn rotate(&mut self) -> io::Result<()> {
        self.file.flush()?;
        for index in (1..=MAX_ROTATED_FILES).rev() {
            let from = rotated_path(&self.path, index);
            let to = rotated_path(&self.path, index + 1);
            if from.exists() {
                if index == MAX_ROTATED_FILES {
                    let _ = fs::remove_file(&from);
                } else {
                    let _ = fs::rename(&from, &to);
                }
            }
        }
        if self.path.exists() {
            let _ = fs::rename(&self.path, rotated_path(&self.path, 1));
        }
        self.file = open_log_file(&self.path)?;
        self.written = 0;
        Ok(())
    }
}

fn open_log_file(path: &Path) -> io::Result<File> {
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    restrict_file_permissions(path)?;
    Ok(file)
}

fn rotated_path(path: &Path, index: usize) -> PathBuf {
    let mut os = path.as_os_str().to_os_string();
    os.push(format!(".{index}"));
    PathBuf::from(os)
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn restrict_dir_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn restrict_dir_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

pub fn default_debug_log_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(|base| PathBuf::from(base).join("FacadeProxy").join("debug.log"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(".facadeproxy").join("debug.log"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotated_paths_append_index() {
        assert!(rotated_path(Path::new("debug.log"), 1).ends_with("debug.log.1"));
    }
}
