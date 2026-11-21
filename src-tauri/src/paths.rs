use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, Result};

/// Valida que un nombre sea un único componente de ruta seguro.
///
/// Los nombres de packs y servidores se generan con `slugify`, así que nunca
/// deberían contener separadores, `..`, ni rutas absolutas. Rechazarlos aquí
/// evita que un argumento del frontend escape del workspace.
pub fn safe_component(value: &str, label: &str) -> Result<String> {
    let trimmed = value.trim();
    // Rechazar ambos separadores en todas las plataformas: en Unix '\' es un
    // carácter válido en nombres de archivo, pero el mismo valor se interpreta
    // como separador en Windows. Los workspaces pueden moverse entre sistemas,
    // así que un nombre con '\' permitido en Linux podría escapar su raíz al
    // abrirlo en Windows.
    if trimmed.is_empty()
        || trimmed.contains('\0')
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(AppError::Validation(format!("Invalid {label} name")));
    }
    let mut components = Path::new(trimmed).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(trimmed.to_string()),
        _ => Err(AppError::Validation(format!("Invalid {label} name: {value}"))),
    }
}

/// Une un nombre validado a `base` y comprueba que el resultado siga dentro.
pub fn contained(base: &Path, name: &str, label: &str) -> Result<PathBuf> {
    let name = safe_component(name, label)?;
    let base = base.canonicalize()?;
    let joined = base.join(name);
    let resolved = joined.canonicalize().unwrap_or_else(|_| joined.clone());
    if !resolved.starts_with(&base) {
        return Err(AppError::Validation(format!("{label} escapes its root")));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_single_components() {
        assert_eq!(safe_component("my-pack", "pack").unwrap(), "my-pack");
        assert_eq!(safe_component("Mi Pack 2", "pack").unwrap(), "Mi Pack 2");
        assert_eq!(safe_component("a.b-c", "pack").unwrap(), "a.b-c");
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        assert!(safe_component("..", "pack").is_err());
        assert!(safe_component("../../secret", "pack").is_err());
        assert!(safe_component("a/b", "pack").is_err());
        assert!(safe_component(r"a\b", "pack").is_err());
        assert!(safe_component("", "pack").is_err());
        assert!(safe_component(".", "pack").is_err());
        assert!(safe_component("a\0b", "pack").is_err());
    }

    #[test]
    fn contained_stays_inside_base() {
        let base = std::env::temp_dir().join(format!("pw-paths-test-{}", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        let inner = base.join("child");
        std::fs::create_dir_all(&inner).unwrap();
        assert_eq!(contained(&base, "child", "pack").unwrap(), inner.canonicalize().unwrap());
        assert!(contained(&base, "../child", "pack").is_err());
        std::fs::remove_dir_all(&base).ok();
    }
}
