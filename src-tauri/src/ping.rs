use std::net::{ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::config;
use crate::error::{AppError, Result};
use crate::server::server_dir;

#[derive(Debug, Clone, Serialize)]
pub struct ServerPing {
    pub online: bool,
    pub motd: String,
    pub version: String,
    pub players_online: usize,
    pub players_max: usize,
    pub sample: Vec<String>,
    pub latency_ms: u64,
}

fn write_varint(value: i32, output: &mut Vec<u8>) {
    let mut remaining = value as u32;
    loop {
        let mut byte = (remaining & 0x7f) as u8;
        remaining >>= 7;
        if remaining != 0 {
            byte |= 0x80;
        }
        output.push(byte);
        if remaining == 0 {
            break;
        }
    }
}

fn read_varint(data: &[u8], position: &mut usize) -> Option<i32> {
    let mut result = 0u32;
    for shift in 0..5 {
        let byte = *data.get(*position)?;
        *position += 1;
        result |= ((byte & 0x7f) as u32) << (shift * 7);
        if byte & 0x80 == 0 {
            return Some(result as i32);
        }
    }
    None
}

fn write_string(value: &str, output: &mut Vec<u8>) {
    write_varint(value.len() as i32, output);
    output.extend_from_slice(value.as_bytes());
}

fn read_string(data: &[u8], position: &mut usize) -> Option<String> {
    let length = read_varint(data, position)? as usize;
    let bytes = data.get(*position..*position + length)?;
    *position += length;
    String::from_utf8(bytes.to_vec()).ok()
}

fn offline() -> ServerPing {
    ServerPing {
        online: false,
        motd: String::new(),
        version: String::new(),
        players_online: 0,
        players_max: 0,
        sample: Vec::new(),
        latency_ms: 0,
    }
}

/// Status request del protocolo de Minecraft (UDP, sin autenticación).
pub async fn ping_address(address: String, port: u16) -> ServerPing {
    let target = match format!("{address}:{port}").to_socket_addrs() {
        Ok(mut addrs) => match addrs.next() {
            Some(value) => value,
            None => return offline(),
        },
        Err(_) => return offline(),
    };

    let response = tokio::task::spawn_blocking(move || -> Option<ServerPing> {
        let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
        socket.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
        socket.set_write_timeout(Some(Duration::from_secs(2))).ok()?;

        let mut handshake = Vec::new();
        write_varint(0, &mut handshake);
        write_varint(765, &mut handshake);
        write_string(&address, &mut handshake);
        handshake.extend_from_slice(&port.to_be_bytes());
        write_varint(1, &mut handshake);
        let mut frame = Vec::new();
        write_varint(handshake.len() as i32, &mut frame);
        frame.extend_from_slice(&handshake);
        frame.extend_from_slice(&[0x01, 0x00]); // request

        let started = Instant::now();
        socket.send_to(&frame, target).ok()?;
        let mut buffer = [0u8; 8192];
        let (size, _) = socket.recv_from(&mut buffer).ok()?;
        let elapsed = started.elapsed();

        let mut position = 0usize;
        let _length = read_varint(&buffer[..size], &mut position)?;
        let packet_id = read_varint(&buffer[..size], &mut position)?;
        if packet_id != 0 {
            return None;
        }
        let body = read_string(&buffer[..size], &mut position)?;
        let value: Value = serde_json::from_str(&body).ok()?;
        let motd = match &value["description"] {
            Value::String(text) => text.clone(),
            Value::Object(object) => object.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
            _ => String::new(),
        };
        let sample = value["players"]["sample"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item["name"].as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        Some(ServerPing {
            online: true,
            motd,
            version: value["version"]["name"].as_str().unwrap_or("").to_string(),
            players_online: value["players"]["online"].as_u64().unwrap_or(0) as usize,
            players_max: value["players"]["max"].as_u64().unwrap_or(0) as usize,
            sample,
            latency_ms: elapsed.as_millis() as u64,
        })
    })
    .await
    .unwrap_or(None)
    .unwrap_or_else(offline);
    response
}

#[tauri::command]
pub async fn server_ping(name: String, host: Option<String>) -> Result<ServerPing> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let text = std::fs::read_to_string(dir.join("server.toml"))?;
    let info: crate::server::ServerInfo = toml_edit::de::from_str(&text)
        .map_err(|e| AppError::Parse(format!("Invalid server.toml: {e}")))?;
    Ok(ping_address(host.unwrap_or_else(|| "127.0.0.1".to_string()), info.port).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_round_trip() {
        for value in [0, 1, 127, 128, 255, 765, 2097151, i32::MAX] {
            let mut bytes = Vec::new();
            write_varint(value, &mut bytes);
            let mut position = 0usize;
            assert_eq!(read_varint(&bytes, &mut position), Some(value));
            assert_eq!(position, bytes.len());
        }
    }

    #[tokio::test]
    async fn parses_status_response() {
        let listener = UdpSocket::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let responder = tokio::task::spawn_blocking(move || {
            let mut buffer = [0u8; 8192];
            let (_, peer) = listener.recv_from(&mut buffer).unwrap();
            let body = r#"{"description":{"text":"Hi"},"players":{"online":2,"max":20,"sample":[{"name":"Steve","id":"x"}]},"version":{"name":"1.21.1"}}"#;
            let mut payload = Vec::new();
            write_varint(0, &mut payload);
            write_string(body, &mut payload);
            let mut frame = Vec::new();
            write_varint(payload.len() as i32, &mut frame);
            frame.extend_from_slice(&payload);
            listener.send_to(&frame, peer).unwrap();
        });

        let ping = ping_address("127.0.0.1".to_string(), port).await;
        responder.await.unwrap();
        assert!(ping.online);
        assert_eq!(ping.motd, "Hi");
        assert_eq!(ping.players_online, 2);
        assert_eq!(ping.players_max, 20);
        assert_eq!(ping.sample, vec!["Steve".to_string()]);
        assert_eq!(ping.version, "1.21.1");
    }
}
