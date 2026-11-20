use super::*;

#[derive(Debug, Serialize)]
pub struct PlayerEvent {
    pub time: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
pub struct ServerActivity {
    pub online: Vec<String>,
    pub events: Vec<PlayerEvent>,
}
pub(crate) fn parse_player_event(line: &str) -> Option<(String, String, &'static str)> {
    let (action, kind) = if line.contains(" joined the game") {
        (" joined the game", "join")
    } else if line.contains(" left the game") {
        (" left the game", "leave")
    } else {
        return None;
    };
    let name = line
        .split_once(action)?
        .0
        .rsplit(": ")
        .next()?
        .trim()
        .to_string();
    if name.is_empty() {
        return None;
    }
    let time = line
        .split_once(']')
        .map(|value| value.0.trim_start_matches('[').to_string())
        .unwrap_or_default();
    Some((time, name, kind))
}

#[tauri::command]
pub fn server_activity(name: String) -> Result<ServerActivity> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let log = dir.join("logs").join("latest.log");
    let text = std::fs::read_to_string(log).unwrap_or_default();
    let mut online: Vec<String> = Vec::new();
    let mut events = Vec::new();
    for line in text.lines() {
        if let Some((time, player, kind)) = parse_player_event(line) {
            match kind {
                "join" if !online.contains(&player) => online.push(player.clone()),
                "leave" => online.retain(|value| value != &player),
                _ => {}
            }
            events.push(PlayerEvent { time, name: player, kind: kind.to_string() });
        }
    }
    events.reverse();
    events.truncate(50);
    Ok(ServerActivity { online, events })
}
#[tauri::command]
pub async fn server_player_action(
    state: tauri::State<'_, ServerState>,
    name: String,
    player: String,
    action: String,
) -> Result<()> {
    let command = match action.as_str() {
        "kick" => format!("kick {player}"),
        "ban" => format!("ban {player}"),
        "pardon" => format!("pardon {player}"),
        _ => return Err(AppError::Validation("Invalid player action".into())),
    };
    write_command(&state, &name, &command).await
}
/// Lee nombres de JSON de Minecraft: arrays con formato o un objeto por línea.
pub(crate) fn read_names(path: &Path) -> Vec<String> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut values: Vec<Value> = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        match value {
            Value::Array(items) => values.extend(items),
            Value::Object(_) => values.push(value),
            _ => {}
        }
    }
    if values.is_empty() {
        for line in trimmed.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Ok(value) = serde_json::from_str::<Value>(line) {
                values.push(value);
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    values
        .into_iter()
        .filter_map(|value| value["name"].as_str().map(str::to_string))
        .filter(|name| seen.insert(name.to_lowercase()))
        .collect()
}

#[tauri::command]
pub fn server_players(name: String) -> Result<ServerPlayers> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    Ok(ServerPlayers {
        ops: read_names(&dir.join("ops.json")),
        whitelist: read_names(&dir.join("whitelist.json")),
        banned: read_names(&dir.join("banned-players.json")),
    })
}

fn players_file(dir: &Path, list: &str) -> Result<PathBuf> {
    match list {
        "ops" => Ok(dir.join("ops.json")),
        "whitelist" => Ok(dir.join("whitelist.json")),
        "bans" => Ok(dir.join("banned-players.json")),
        _ => Err(AppError::Validation("Invalid player list".into())),
    }
}

fn player_cache_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|base| base.join("packwright").join("cache").join("players"))
}

fn read_name_cache() -> HashMap<String, Option<String>> {
    let Some(dir) = player_cache_dir() else { return HashMap::new() };
    std::fs::read_to_string(dir.join("names.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_name_cache(values: &HashMap<String, Option<String>>) {
    if let Some(dir) = player_cache_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(text) = serde_json::to_string(values) {
            let _ = std::fs::write(dir.join("names.json"), text);
        }
    }
}

static UUID_CACHE: LazyLock<Mutex<HashMap<String, Option<String>>>> =
    LazyLock::new(|| Mutex::new(read_name_cache()));
static AVATAR_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

async fn resolve_uuid(client: &reqwest::Client, player: &str) -> Option<String> {
    let safe: String = player.chars()
        .filter(|value| value.is_ascii_alphanumeric() || *value == '_')
        .collect();
    if safe.is_empty() {
        return None;
    }
    if let Some(cached) = UUID_CACHE.lock().await.get(&safe) {
        return cached.clone();
    }
    let mut resolved = None;
    for url in [
        format!("https://api.minecraftservices.com/minecraft/profile/lookup/name/{safe}"),
        format!("https://api.mojang.com/users/profiles/minecraft/{safe}"),
    ] {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(body) = response.json::<Value>().await {
                    if let Some(id) = body["id"].as_str() {
                        resolved = Some(id.to_string());
                        break;
                    }
                }
            }
        }
    }
    let mut cache = UUID_CACHE.lock().await;
    cache.insert(safe, resolved.clone());
    save_name_cache(&cache);
    resolved
}

/// Devuelve la cara del jugador como data URL (caché en memoria y en disco).
#[tauri::command]
pub async fn player_avatar(player: String) -> Result<String> {
    let client = http_client()?;
    let uuid = resolve_uuid(&client, &player).await
        .ok_or_else(|| AppError::NotFound("Player UUID not found".into()))?;
    if let Some(cached) = AVATAR_CACHE.lock().await.get(&uuid) {
        return Ok(cached.clone());
    }
    if let Some(dir) = player_cache_dir() {
        if let Ok(bytes) = std::fs::read(dir.join(format!("{uuid}.png"))) {
            let data = format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            );
            AVATAR_CACHE.lock().await.insert(uuid, data.clone());
            return Ok(data);
        }
    }
    let mut bytes = None;
    for url in [
        format!("https://minotar.net/helm/{uuid}/64.png"),
        format!("https://crafatar.com/avatars/{uuid}?size=64&overlay"),
    ] {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                if let Ok(body) = response.bytes().await {
                    bytes = Some(body);
                    break;
                }
            }
        }
    }
    let bytes = bytes.ok_or_else(|| AppError::NotFound("Avatar not available".into()))?;
    if let Some(dir) = player_cache_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(format!("{uuid}.png")), &bytes);
    }
    let data = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    AVATAR_CACHE.lock().await.insert(uuid, data.clone());
    Ok(data)
}

#[tauri::command]
pub async fn server_player_add(name: String, list: String, player: String) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let file = players_file(&dir, &list)?;
    let mut entries: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&file).unwrap_or_else(|_| "[]".into()))
        .unwrap_or_default();
    if entries.iter().any(|entry| entry["name"].as_str().is_some_and(|value| value.eq_ignore_ascii_case(&player))) {
        return Ok(());
    }
    let uuid = resolve_uuid(&http_client()?, &player).await
        .unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string());
    entries.push(json!({ "uuid": uuid, "name": player, "level": 4 }));
    std::fs::write(file, serde_json::to_string_pretty(&entries)
        .map_err(|e| AppError::Parse(format!("Could not serialize player list: {e}")))?)?;
    Ok(())
}

#[tauri::command]
pub fn server_player_remove(name: String, list: String, player: String) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let file = players_file(&dir, &list)?;
    let entries: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&file).unwrap_or_else(|_| "[]".into()))
        .unwrap_or_default();
    let kept: Vec<Value> = entries.into_iter()
        .filter(|entry| !entry["name"].as_str().is_some_and(|value| value.eq_ignore_ascii_case(&player)))
        .collect();
    std::fs::write(file, serde_json::to_string_pretty(&kept)
        .map_err(|e| AppError::Parse(format!("Could not serialize player list: {e}")))?)?;
    Ok(())
}

/// Nombres conocidos (usercache, listas y logs) para autocompletar la consola.
#[tauri::command]
pub fn server_known_players(name: String) -> Result<Vec<String>> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let mut names: Vec<String> = Vec::new();
    for file in ["usercache.json", "ops.json", "whitelist.json", "banned-players.json"] {
        names.extend(read_names(&dir.join(file)));
    }
    if let Ok(text) = std::fs::read_to_string(dir.join("logs").join("latest.log")) {
        for line in text.lines() {
            if let Some((_, player, _)) = parse_player_event(line) {
                names.push(player);
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    names.retain(|value| seen.insert(value.to_lowercase()));
    names.sort_by_key(|value| value.to_lowercase());
    Ok(names)
}
