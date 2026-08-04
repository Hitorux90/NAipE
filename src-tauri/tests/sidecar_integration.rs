//! End-to-end sidecar integration tests.
//!
//! Each test spawns a fresh Python sidecar process, sends NDJSON requests,
//! and verifies the response. Tests are async (`#[tokio::test]`) because
//! `SidecarManager::new()` requires a tokio runtime.

use std::path::PathBuf;

use apetauri_lib::sidecar::{
    SidecarConfig, SidecarManager, SidecarRequest,
};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Finds a working Python 3 interpreter on this Windows host.
fn find_python() -> PathBuf {
    std::env::var("APEPYTHON")
        .or_else(|_| std::env::var("PYTHON"))
        .unwrap_or_else(|_| {
            r"C:\Users\Raúl\AppData\Local\Programs\Python\Python312\python.exe".to_string()
        })
        .into()
}

/// Resolves the sidecar script relative to the project root.
fn find_sidecar_script() -> PathBuf {
    let manifest: PathBuf = env!("CARGO_MANIFEST_DIR").into();
    // Try python-core first (primary sidecar), then sidecar/__main__.py (alt).
    let primary = manifest
        .parent()
        .unwrap()
        .join("python-core")
        .join("sidecar_console.py");
    let alt = manifest.join("sidecar").join("__main__.py");
    if primary.exists() { primary } else { alt }
}

/// Spawn a `SidecarManager` with default config, panicking on failure.
async fn spawn_manager() -> SidecarManager {
    let python = find_python();
    let script = find_sidecar_script();
    assert!(
        python.exists(),
        "Python executable not found at {}",
        python.display()
    );
    assert!(
        script.exists(),
        "Sidecar script not found at {}",
        script.display()
    );
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    SidecarManager::new(&python, &[script], &cwd, SidecarConfig::default())
        .await
        .expect("failed to spawn sidecar manager")
}

/// Helper to send a simple command with an empty payload.
async fn send(
    manager: &SidecarManager,
    command: &str,
) -> apetauri_lib::sidecar::SidecarResponse {
    let req = SidecarRequest::new(Uuid::new_v4(), command)
        .with_payload(serde_json::json!({}));
    manager.send_request(req).await.expect("send_request failed")
}

// ---------------------------------------------------------------------------
// Test 1: Normal Lifecycle — send a parse_ape command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_parse_ape_command() {
    let manager = spawn_manager().await;

    let req = SidecarRequest::new(Uuid::new_v4(), "parse_ape")
        .with_payload(serde_json::json!({
            "content": "ATGCATGC",
            "id": "test-seq-1",
        }));

    let response = manager.send_request(req).await.expect("send_request failed");

    assert!(response.ok, "parse_ape should succeed");
    let result = response.result.expect("result should be present");

    // The Python handler returns: id, name, sequence, topology, annotations, length_bp
    assert_eq!(result.get("name").and_then(|v| v.as_str()), Some("parsed"));
    assert_eq!(
        result.get("sequence").and_then(|v| v.as_str()),
        Some("ATGCATGC")
    );
    assert_eq!(
        result.get("topology").and_then(|v| v.as_str()),
        Some("circular")
    );
    assert_eq!(result.get("length_bp").and_then(|v| v.as_i64()), Some(8));

    // manager dropped here → Drop kills child
}

// ---------------------------------------------------------------------------
// Test 2: Health Check — ping/pong
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_health_ping() {
    let manager = spawn_manager().await;

    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "sidecar should report alive");
}

// ---------------------------------------------------------------------------
// Test 3: Auto-Restart — restart and send again
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_restart_and_send() {
    let manager = spawn_manager().await;

    // Confirm alive before restart.
    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "pre-restart health ping should succeed");

    // Restart and confirm alive again.
    manager.restart().await.expect("restart failed");

    let alive2 = manager.health_ping().await.expect("post-restart health_ping failed");
    assert!(alive2, "post-restart health ping should succeed");
}

// ---------------------------------------------------------------------------
// Test 4: Error Envelope — unknown command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_unknown_command_error() {
    let manager = spawn_manager().await;

    let resp = send(&manager, "nonexistent_command").await;

    assert!(!resp.ok, "unknown command should fail");
    let result = resp.result.expect("result should be present");
    assert!(
        result.get("error").is_some()
            || result.as_str().map(|s| s.contains("unknown")).unwrap_or(false),
        "result should contain an error about unknown command, got: {}",
        result
    );
}

// ---------------------------------------------------------------------------
// Test 5: Temp File Offloading — large payload triggers offload
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_large_payload_offloading() {
    let manager = spawn_manager().await;

    // Build a large string payload (200 bytes, well above 100 threshold).
    let large_content = "A".repeat(200);
    let req = SidecarRequest::new(Uuid::new_v4(), "ping")
        .with_large_payload(large_content.as_bytes().to_vec(), 100);

    // After with_large_payload, the request should have offloaded=true
    assert!(
        req.offloaded.is_some(),
        "payload > 100 bytes should be offloaded"
    );

    // The offloaded path should exist on disk.
    let offloaded_path = req.offloaded.as_ref().unwrap().path.clone();
    assert!(
        offloaded_path.exists(),
        "offloaded temp file should exist at {}",
        offloaded_path.display()
    );

    // Send the request. The "ping" handler ignores payload,
    // so it should succeed even with a null inline payload.
    let response = manager
        .send_request(req)
        .await
        .expect("send_request with offloaded payload failed");

    assert!(response.ok, "offloaded request should succeed");
}

// ---------------------------------------------------------------------------
// Additional smoke: send multiple stub commands in sequence
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_multiple_commands_same_connection() {
    let manager = spawn_manager().await;

    // Test health_ping.
    let alive = manager.health_ping().await.expect("health_ping failed");
    assert!(alive, "ping should report alive");

    // Test each stub command with minimal payloads.
    let tests: &[(&str, serde_json::Value)] = &[
            ("ping", serde_json::json!({})),
            ("create_sequence", serde_json::json!({"name": "t", "sequence": "ATGC", "topology": "circular"})),
            ("list_parts", serde_json::json!({})),
        ];

    for (cmd, payload) in tests {
        let req = SidecarRequest::new(Uuid::new_v4(), *cmd).with_payload(payload.clone());
        let resp = manager.send_request(req).await.expect("send_request failed");
        assert!(resp.ok, "command '{}' should succeed, got: {:?}", cmd, resp.result);
    }
}

// ---------------------------------------------------------------------------
// Test 7: GenBank file open — feature count, strand, note, translation
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_open_genbank_returns_features() {
    let manager = spawn_manager().await;

    let gb_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("test_data")
        .join("pMG_SP-4_speB.gb");

    assert!(gb_path.exists(), "test .gb file not found at {}", gb_path.display());

    let req = SidecarRequest::new(Uuid::new_v4(), "open_sequence")
        .with_payload(serde_json::json!({
            "target_path": gb_path.to_string_lossy(),
        }));

    let response = manager.send_request(req).await.expect("send_request failed");
    // Also print the full result for debugging
    eprintln!("open_sequence response: ok={}, result={:?}", response.ok, response.result);
    assert!(response.ok, "open_sequence for .gb should succeed, response: {:?}", response.result);

    let result = response.result.expect("result should be present");

    // Top-level metadata
    assert_eq!(
        result.get("name").and_then(|v| v.as_str()),
        Some("pMG36E-SP-4_speB")
    );
    assert_eq!(
        result.get("topology").and_then(|v| v.as_str()),
        Some("circular")
    );
    assert_eq!(result.get("length_bp").and_then(|v| v.as_i64()), Some(4801));

    // Feature array
    let features = result
        .get("features")
        .and_then(|v| v.as_array())
        .expect("features should be an array");

    assert_eq!(features.len(), 29, "expected 29 features, got {}", features.len());

    // First feature: primer with note
    let f0 = &features[0];
    assert_eq!(f0.get("type").and_then(|v| v.as_str()), Some("primer"));
    assert_eq!(f0.get("start").and_then(|v| v.as_i64()), Some(1));
    assert_eq!(f0.get("end").and_then(|v| v.as_i64()), Some(25));
    assert_eq!(f0.get("strand").and_then(|v| v.as_i64()), Some(1));
    assert_eq!(
        f0.get("name").and_then(|v| v.as_str()),
        Some("pMG36E_speB_fw")
    );
    let note = f0.get("note").and_then(|v| v.as_str()).unwrap_or("");
    assert!(
        note.contains("sequence:"),
        "primer note should contain 'sequence:', got: {}",
        note
    );

    // Factor Xa site: reverse strand, translation preserved
    let fxa = features
        .iter()
        .find(|f| f.get("name").and_then(|v| v.as_str()) == Some("Factor Xa site"))
        .expect("Factor Xa site feature must be present");
    assert_eq!(fxa.get("strand").and_then(|v| v.as_i64()), Some(-1));
    assert_eq!(
        fxa.get("translation").and_then(|v| v.as_str()),
        Some("IEGR")
    );

    // Ori feature: color preserved
    let ori = features
        .iter()
        .find(|f| f.get("name").and_then(|v| v.as_str()) == Some("ori"))
        .expect("ori feature must be present");
    assert_eq!(
        ori.get("color").and_then(|v| v.as_str()),
        Some("#ffef86")
    );

    // Unlabeled CDS: name falls back to type, translation > 100 aa
    let cds = features
        .iter()
        .find(|f| {
            f.get("type").and_then(|v| v.as_str()) == Some("CDS")
                && f.get("start").and_then(|v| v.as_i64()) == Some(3478)
        })
        .expect("unlabeled CDS at 3478..4692 must be present");
    assert_eq!(
        cds.get("name").and_then(|v| v.as_str()),
        Some("CDS"),
        "unlabeled CDS should fall back to 'CDS'"
    );
    let translation = cds.get("translation").and_then(|v| v.as_str()).unwrap_or("");
    assert!(
        translation.len() > 100,
        "CDS translation should be > 100 aa, got {} chars",
        translation.len()
    );
}

// ---------------------------------------------------------------------------
// Test 8: Restriction Digest Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_restriction_digest_command() {
    let manager = spawn_manager().await;

    // GAATTC is EcoRI, GGATCC is BamHI
    let req = SidecarRequest::new(Uuid::new_v4(), "digest")
        .with_payload(serde_json::json!({
            "sequence": "GAATTCaaaaGGATCCbbbb",
            "topology": "circular",
            "enzymes": ["EcoRI", "BamHI"]
        }));

    let response = manager.send_request(req).await.expect("send_request failed");
    assert!(response.ok, "digest should succeed");

    let result = response.result.expect("result should be present");
    let cuts = result.get("cuts").and_then(|v| v.as_array()).expect("cuts should be array");
    assert_eq!(cuts.len(), 2, "should find 2 cut sites");
}

// ---------------------------------------------------------------------------
// Test 9: Primer Analysis & Virtual PCR Simulation
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_primer_and_pcr_commands() {
    let manager = spawn_manager().await;

    // Test analyze_primer
    let req1 = SidecarRequest::new(Uuid::new_v4(), "analyze_primer")
        .with_payload(serde_json::json!({
            "primer": "ATGCATGCATGCATGC"
        }));
    let res1 = manager.send_request(req1).await.expect("analyze_primer failed");
    assert!(res1.ok, "analyze_primer should succeed");
    let r1 = res1.result.expect("result present");
    assert_eq!(r1.get("length").and_then(|v| v.as_i64()), Some(16));

    // Test simulate_pcr
    // Template: ATGCATGCATGC...GCATGCATGCAT (rc of ATGCATGCATGC is GCATGCATGCAT)
    let template = "ATGCATGCATGCaaaaaGCATGCATGCAT";
    let req2 = SidecarRequest::new(Uuid::new_v4(), "simulate_pcr")
        .with_payload(serde_json::json!({
            "template": template,
            "forward_primer": "ATGCATGCATGC",
            "reverse_primer": "ATGCATGCATGC"
        }));
    let res2 = manager.send_request(req2).await.expect("simulate_pcr failed");
    assert!(res2.ok, "simulate_pcr should succeed");
    let r2 = res2.result.expect("result present");
    assert_eq!(r2.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(r2.get("length_bp").and_then(|v| v.as_i64()), Some(29));
}

// ---------------------------------------------------------------------------
// Test 10: ORF Finding Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_find_orfs_command() {
    let manager = spawn_manager().await;

    // ATG + 10x GCA (Ala) + TAA (Stop) -> 36 bp, 11 aa
    let sequence = "ATGGCAGCAGCAGCAGCAGCAGCAGCAGCATAA";
    let req = SidecarRequest::new(Uuid::new_v4(), "find_orfs")
        .with_payload(serde_json::json!({
            "sequence": sequence,
            "topology": "linear",
            "min_length_aa": 5
        }));

    let response = manager.send_request(req).await.expect("find_orfs failed");
    assert!(response.ok, "find_orfs should succeed");

    let result = response.result.expect("result present");
    let orfs = result.get("orfs").and_then(|v| v.as_array()).expect("orfs array present");
    assert!(!orfs.is_empty(), "should find at least 1 ORF");
}

// ---------------------------------------------------------------------------
// Test 11: Sequence Alignment Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_sequence_alignment_command() {
    let manager = spawn_manager().await;

    let req = SidecarRequest::new(Uuid::new_v4(), "align_sequences")
        .with_payload(serde_json::json!({
            "query": "ATGCATGCATGC",
            "target": "ATGCATGCATGC",
            "mode": "global"
        }));

    let response = manager.send_request(req).await.expect("align_sequences failed");
    assert!(response.ok, "align_sequences should succeed");

    let result = response.result.expect("result present");
    assert_eq!(result.get("identity_percent").and_then(|v| v.as_f64()), Some(100.0));
}

// ---------------------------------------------------------------------------
// Test 12: Virtual Assembly Simulation Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_virtual_assembly_command() {
    let manager = spawn_manager().await;

    // Part 1 ends with OVERLAP12345, Part 2 starts with OVERLAP12345
    let req = SidecarRequest::new(Uuid::new_v4(), "simulate_assembly")
        .with_payload(serde_json::json!({
            "parts": [
                { "name": "Vector", "sequence": "ATGCATGCATGCAGATCGATCG" },
                { "name": "Insert", "sequence": "AGATCGATCGTTTTTTTTTTTT" }
            ],
            "method": "gibson"
        }));

    let response = manager.send_request(req).await.expect("simulate_assembly failed");
    assert!(response.ok, "simulate_assembly should succeed");

    let result = response.result.expect("result present");
    assert_eq!(result.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert!(result.get("assembled_sequence").is_some());
}

// ---------------------------------------------------------------------------
// Test 13: Biochemical Property Calculation Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_compute_properties_command() {
    let manager = spawn_manager().await;

    // 20 bp sequence (10 GC, 10 AT -> 50% GC)
    let sequence = "GCGCGCGCGCATATATATAT";
    let req = SidecarRequest::new(Uuid::new_v4(), "compute_properties")
        .with_payload(serde_json::json!({
            "sequence": sequence,
            "window_size": 10,
            "step": 5
        }));

    let response = manager.send_request(req).await.expect("compute_properties failed");
    assert!(response.ok, "compute_properties should succeed");

    let result = response.result.expect("result present");
    assert_eq!(result.get("overall_gc").and_then(|v| v.as_f64()), Some(50.0));
    assert!(result.get("gc_profile").is_some());
}

// ---------------------------------------------------------------------------
// Test 14: Auto-Annotation Engine Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_auto_annotate_command() {
    let manager = spawn_manager().await;

    // T7 promoter sequence
    let sequence = "CCCCCCCTAATACGACTCACTATAGGGGGGGGGG";
    let req = SidecarRequest::new(Uuid::new_v4(), "auto_annotate")
        .with_payload(serde_json::json!({
            "sequence": sequence,
            "min_identity": 90.0
        }));

    let response = manager.send_request(req).await.expect("auto_annotate failed");
    assert!(response.ok, "auto_annotate should succeed");

    let result = response.result.expect("result present");
    let hits = result.get("hits").and_then(|v| v.as_array()).expect("hits array present");
    assert!(!hits.is_empty(), "should find T7 promoter hit");
}

// ---------------------------------------------------------------------------
// Test 15: Motif & IUPAC Pattern Search Command
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_search_motif_command() {
    let manager = spawn_manager().await;

    // Search for Shine-Dalgarno RBS motif (AGGAGG)
    let sequence = "ATGCATGCAGGAGGTTTTTTTT";
    let req = SidecarRequest::new(Uuid::new_v4(), "search_motif")
        .with_payload(serde_json::json!({
            "sequence": sequence,
            "pattern": "AGGAGG",
            "is_regex": false
        }));

    let response = manager.send_request(req).await.expect("search_motif failed");
    assert!(response.ok, "search_motif should succeed");

    let result = response.result.expect("result present");
    let hits = result.get("hits").and_then(|v| v.as_array()).expect("hits array present");
    assert!(!hits.is_empty(), "should find Shine-Dalgarno motif hit");
}