use base64::prelude::{Engine as _, BASE64_STANDARD};
use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

use crate::error::{AppError, AppResult};

const KEY_FILE: &str = "secure.key";
const NONCE_LEN: usize = 12;

/// Encrypts provider API keys at rest with AES-256-GCM.
///
/// The 32 byte master key lives next to the database in a file that is only
/// readable by the current user (`0600`). This keeps secrets out of the SQLite
/// file, out of the frontend and out of logs, without requiring a system
/// keyring daemon (which is not available on every Linux desktop).
pub struct KeyVault {
    cipher: Aes256Gcm,
}

impl KeyVault {
    pub fn load_or_create(dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(KEY_FILE);

        let mut key = [0u8; 32];
        if path.exists() {
            let bytes = std::fs::read(&path)?;
            if bytes.len() != 32 {
                return Err(AppError::Other(
                    "The local encryption key is corrupted. Remove secure.key to reset stored API keys."
                        .into(),
                ));
            }
            key.copy_from_slice(&bytes);
        } else {
            getrandom::fill(&mut key)
                .map_err(|e| AppError::Other(format!("Could not generate a local key: {e}")))?;
            std::fs::write(&path, key)?;
            restrict_permissions(&path)?;
        }

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

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> AppResult<()> {
    Ok(())
}
