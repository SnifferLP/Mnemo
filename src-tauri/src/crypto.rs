use base64::prelude::{Engine as _, BASE64_STANDARD};
use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

use crate::error::{AppError, AppResult};

const KEY_FILE: &str = "secure.key";
const NONCE_LEN: usize = 12;

/// Encrypts provider API keys at rest with AES-256-GCM.
///
/// The 32 byte master key lives next to the database. On Unix it is written
/// with mode `0600`; on Windows it is wrapped with the current user's DPAPI
/// key before it reaches disk. This keeps secrets out of the SQLite file, out
/// of the frontend and out of logs without requiring a system keyring daemon.
pub struct KeyVault {
    cipher: Aes256Gcm,
}

impl KeyVault {
    pub fn load_or_create(dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(KEY_FILE);

        let key = if path.exists() {
            let bytes = std::fs::read(&path)?;
            decode_key(&path, &bytes)?
        } else {
            let mut key = [0u8; 32];
            getrandom::fill(&mut key)
                .map_err(|e| AppError::Other(format!("Could not generate a local key: {e}")))?;
            write_key(&path, &key)?;
            key
        };

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|_| AppError::Other("Could not initialise the key vault".into()))?;
        Ok(Self { cipher })
    }

    pub fn encrypt(&self, plaintext: &str) -> AppResult<String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce_bytes)
            .map_err(|e| AppError::Other(format!("Could not generate a nonce: {e}")))?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|_| AppError::Other("Could not encrypt the API key".into()))?;

        let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(BASE64_STANDARD.encode(combined))
    }

    pub fn decrypt(&self, encoded: &str) -> AppResult<String> {
        let raw = BASE64_STANDARD.decode(encoded)?;
        if raw.len() <= NONCE_LEN {
            return Err(AppError::Other("Stored API key is malformed".into()));
        }
        let (nonce_bytes, ciphertext) = raw.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| AppError::Other("Could not decrypt the stored API key".into()))?;
        String::from_utf8(plaintext).map_err(Into::into)
    }
}

#[cfg(not(windows))]
fn decode_key(_path: &Path, bytes: &[u8]) -> AppResult<[u8; 32]> {
    if bytes.len() != 32 {
        return Err(corrupt_key_error());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(bytes);
    Ok(key)
}

#[cfg(not(windows))]
fn write_key(path: &Path, key: &[u8; 32]) -> AppResult<()> {
    std::fs::write(path, key)?;
    restrict_permissions(path)?;
    Ok(())
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(windows)]
const DPAPI_PREFIX: &[u8] = b"MNEMO-DPAPI-1\0";
#[cfg(windows)]
const DPAPI_ENTROPY: &[u8] = b"com.mnemo.study/secure-key/v1";

#[cfg(windows)]
fn decode_key(path: &Path, bytes: &[u8]) -> AppResult<[u8; 32]> {
    if let Some(payload) = bytes.strip_prefix(DPAPI_PREFIX) {
        let raw = unprotect(payload)?;
        if raw.len() != 32 {
            return Err(corrupt_key_error());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&raw);
        return Ok(key);
    }

    // Development builds before 1.2.0 wrote the raw 32-byte key on Windows.
    // Read it first, then replace it atomically with a DPAPI-wrapped copy.
    if bytes.len() == 32 {
        let mut key = [0u8; 32];
        key.copy_from_slice(bytes);
        write_key(path, &key).map_err(|error| {
            AppError::Other(format!(
                "The local encryption key could not be protected with Windows DPAPI: {error}. \
                 The existing secure.key was left unchanged."
            ))
        })?;
        return Ok(key);
    }

    Err(corrupt_key_error())
}

#[cfg(windows)]
fn write_key(path: &Path, key: &[u8; 32]) -> AppResult<()> {
    let protected = protect(key)?;
    let mut encoded = Vec::with_capacity(DPAPI_PREFIX.len() + protected.len());
    encoded.extend_from_slice(DPAPI_PREFIX);
    encoded.extend_from_slice(&protected);

    // Write a sibling first and atomically replace the old key only after the
    // DPAPI payload is safely on disk. A failed replacement leaves the
    // existing key untouched.
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(KEY_FILE);
    let temporary = path.with_file_name(format!("{file_name}.tmp"));
    let write_result = std::fs::File::create(&temporary).and_then(|mut file| {
        use std::io::Write;
        file.write_all(&encoded)?;
        file.sync_all()
    });
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }
    if let Err(error) = replace_file(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

#[cfg(windows)]
fn protect(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let length = u32::try_from(data.len())
        .map_err(|_| AppError::Other("The local encryption key is too large.".into()))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: length,
        pbData: data.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: DPAPI_ENTROPY.len() as u32,
        pbData: DPAPI_ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    let ok = unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            &entropy,
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(AppError::Other(format!(
            "Windows DPAPI encryption failed: {}",
            std::io::Error::last_os_error()
        )));
    }

    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(result)
}

#[cfg(windows)]
fn unprotect(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let length = u32::try_from(data.len())
        .map_err(|_| AppError::Other("The protected local key is too large.".into()))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: length,
        pbData: data.as_ptr() as *mut u8,
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: DPAPI_ENTROPY.len() as u32,
        pbData: DPAPI_ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    let ok = unsafe {
        CryptUnprotectData(
            &input,
            ptr::null_mut(),
            &entropy,
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(AppError::Other(
            "The Windows-protected local encryption key could not be decrypted. \
             It is tied to the Windows user profile that created it."
                .into(),
        ));
    }

    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(result)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    let source = wide(source);
    let destination = wide(destination);
    let ok = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn corrupt_key_error() -> AppError {
    AppError::Other(
        "The local encryption key is corrupted. Remove secure.key to reset stored API keys.".into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mnemo-key-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn key_vault_round_trips_across_reload() {
        let dir = temp_dir();
        let encrypted = {
            let vault = KeyVault::load_or_create(&dir).expect("create vault");
            vault.encrypt("sk-test-value").expect("encrypt")
        };
        {
            let vault = KeyVault::load_or_create(&dir).expect("reload vault");
            assert_eq!(vault.decrypt(&encrypted).expect("decrypt"), "sk-test-value");
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn unix_key_file_is_private() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir();
        let _vault = KeyVault::load_or_create(&dir).expect("create vault");
        let mode = std::fs::metadata(dir.join(KEY_FILE))
            .expect("key metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(windows)]
    #[test]
    fn windows_migrates_a_legacy_raw_key() {
        let dir = temp_dir();
        let path = dir.join(KEY_FILE);
        std::fs::write(&path, [7u8; 32]).expect("legacy key");

        let encrypted = {
            let vault = KeyVault::load_or_create(&dir).expect("load legacy vault");
            vault.encrypt("legacy-secret").expect("encrypt")
        };
        let stored = std::fs::read(&path).expect("protected key");
        assert!(stored.starts_with(DPAPI_PREFIX));
        assert_ne!(stored.as_slice(), [7u8; 32].as_slice());

        {
            let vault = KeyVault::load_or_create(&dir).expect("reload protected vault");
            assert_eq!(vault.decrypt(&encrypted).expect("decrypt"), "legacy-secret");
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
