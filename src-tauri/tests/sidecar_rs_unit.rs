//! NDJSON framing helper mirroring the core logic from `sidecar.rs`.
//!
//! This module is intentionally kept synchronous and isolated so it can be
//! unit-tested without spinning up a tokio runtime or a Python child process.

pub fn encode_ndjson_line<T: serde::Serialize>(value: &T) -> serde_json::Result<String> {
    let mut text = serde_json::to_string(value)?;
    text.push('\n');
    Ok(text)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodeStatus<T> {
    Line(T),
    Empty,
    Partial,
    Malformed,
}

/// Feeds `chunk` into `buffer` and attempts to extract one NDJSON line.
///
/// Behavior:
/// - Empty chunks/remaining lines are skipped (`Empty`).
/// - A chunk without a trailing newline is held in `buffer` (`Partial`).
/// - A complete line is parsed; on success `Line(value)` is returned.
/// - A complete line that fails to parse returns `Malformed`.
pub fn decode_ndjson_line<T: serde::de::DeserializeOwned>(
    buffer: &mut String,
    chunk: &str,
) -> DecodeStatus<T> {
    buffer.push_str(chunk);

    let newline_pos = match buffer.find('\n') {
        Some(pos) => pos,
        None => return DecodeStatus::Partial,
    };

    let line = buffer[..newline_pos].trim().to_owned();
    buffer.drain(..=newline_pos);

    if line.is_empty() {
        return DecodeStatus::Empty;
    }

    match serde_json::from_str(&line) {
        Ok(value) => DecodeStatus::Line(value),
        Err(_) => DecodeStatus::Malformed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
    struct Wrapper {
        id: String,
        ok: bool,
    }

    #[test]
    fn valid_line_parses() {
        let mut buffer = String::new();
        let payload = Wrapper {
            id: "req-1".into(),
            ok: true,
        };

        let encoded = encode_ndjson_line(&payload).expect("encode");
        let status = decode_ndjson_line::<Wrapper>(&mut buffer, &encoded);

        assert!(matches!(status, DecodeStatus::Line(ref w) if *w == payload));
    }

    #[test]
    fn empty_line_is_skipped() {
        let mut buffer = String::new();
        let status = decode_ndjson_line::<Wrapper>(&mut buffer, "\n");
        assert!(matches!(status, DecodeStatus::Empty));
        assert!(buffer.is_empty());
    }

    #[test]
    fn empty_line_after_data_is_skipped_and_data_parsed() {
        let mut buffer = String::new();
        let payload = Wrapper {
            id: "req-2".into(),
            ok: true,
        };
        let encoded = encode_ndjson_line(&payload).expect("encode");

        let status = decode_ndjson_line::<Wrapper>(&mut buffer, &encoded);
        assert!(matches!(status, DecodeStatus::Line(ref w) if *w == payload));

        let status2 = decode_ndjson_line::<Wrapper>(&mut buffer, "\n");
        assert!(matches!(status2, DecodeStatus::Empty));
    }

    #[test]
    fn malformed_json_returns_malformed() {
        let mut buffer = String::new();
        let status = decode_ndjson_line::<Wrapper>(&mut buffer, "{not json}\n");
        assert!(matches!(status, DecodeStatus::Malformed));
    }

    #[test]
    fn partial_line_stays_buffered() {
        let mut buffer = String::new();
        let chunk = "{\"id\":\"req-3\""; // no newline, no closing brace
        let status = decode_ndjson_line::<Wrapper>(&mut buffer, chunk);
        assert!(matches!(status, DecodeStatus::Partial));
        assert_eq!(buffer, chunk);
    }

    #[test]
    fn partial_line_completes_on_next_chunk() {
        let mut buffer = String::new();
        let payload = Wrapper {
            id: "req-4".into(),
            ok: true,
        };

        let encoded = encode_ndjson_line(&payload).expect("encode");
        let split_at = encoded.find('\n').unwrap();
        let first = &encoded[..split_at];
        let second = &encoded[split_at..];

        let status = decode_ndjson_line::<Wrapper>(&mut buffer, first);
        assert!(matches!(status, DecodeStatus::Partial));

        let status2 = decode_ndjson_line::<Wrapper>(&mut buffer, second);
        assert!(matches!(status2, DecodeStatus::Line(ref w) if *w == payload));
    }

    #[test]
    fn encode_round_trip() {
        let payload = Wrapper {
            id: "round-trip".into(),
            ok: false,
        };
        let encoded = encode_ndjson_line(&payload).expect("encode");
        let decoded: Wrapper = serde_json::from_str(encoded.trim()).expect("decode");
        assert_eq!(payload, decoded);
    }
}
