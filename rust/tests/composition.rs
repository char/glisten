use glisten::{Highlighter, Language};
use serde_json::json;

fn language(
    name: &str,
    embeds: &[&str],
    styles: serde_json::Value,
    records: &[[u32; 2]],
) -> Language {
    let manifest = json!({
        "abi": 4, "language": name, "aliases": [], "embeds": embeds,
        "styles": styles, "styleMap": 0, "areaBytes": 16, "maxDepth": 16,
    });
    let metadata = manifest
        .to_string()
        .bytes()
        .map(|byte| format!("\\{byte:02x}"))
        .collect::<String>();
    let mut stores = String::new();
    let mut name_record = false;
    for (i, &[value, word]) in records.iter().enumerate() {
        let kind = word >> 29;
        let encoded = if !name_record && (kind == 0 || kind == 2) {
            format!(
                "(i32.or (i32.const {})\n                (i32.load16_u (i32.add (global.get $base) (i32.const {}))))",
                word & !0x1fff_ffff,
                (word & 0xffff) * 2
            )
        } else {
            format!("(i32.const {word})")
        };
        name_record = !name_record && kind == 7;
        stores.push_str(&format!(
            "(i32.store offset={} (local.get $out) (i32.const {value}))\n            (i32.store offset={} (local.get $out) {encoded})\n            ",
            i * 8,
            i * 8 + 4,
        ));
    }
    let injections = records.iter().filter(|[_, word]| word >> 29 >= 6).count();
    let groups = records.iter().filter(|[_, word]| word >> 29 == 2).count();
    let bytes = wat::parse_str(format!(
        r#"(module
        (import "env" "memory" (memory 1))
        (import "env" "base" (global $base i32))
        (@custom "glisten" "{metadata}")
        (global (export "records") (mut i32) (i32.const {count}))
        (global (export "injections") (mut i32) (i32.const {injections}))
        (global (export "groups") (mut i32) (i32.const {groups}))
        (global (export "status") (mut i32) (i32.const 0))
        (func (export "highlight") (param i32 i32 i32 i32) (param $out i32) (result i32)
            {stores}(i32.const 0)))"#,
        count = records.len()
    ))
    .unwrap();
    Language::new(&bytes).unwrap()
}

#[test]
fn groups_crossing_source_gaps_retain_their_full_attribute() {
    let root = language(
        "root",
        &["child"],
        json!([{"name":"plain"}]),
        &[[0, 6 << 29], [2, 4 << 29], [3, 0], [5, 5 << 29]],
    );
    let child = language(
        "child",
        &[],
        json!([
            {"name":"plain"}, {"name":"keyword", "tag":"k"},
            {"name":"constant.color", "tag":"co", "attribute":"v"},
        ]),
        &[[1, 1], [3, 0], [4, 1], [0, (2 << 29) | 2]],
    );
    let mut host = Highlighter::new().unwrap();
    host.add(&root).unwrap();
    host.add(&child).unwrap();
    let result = host.process("root", "ab\ncd").unwrap();
    assert_eq!(
        host.render_lines("ab\ncd", &result),
        [
            "<g-co v=\"abcd\"><g-k>a</g-k>b</g-co>",
            "<g-co v=\"abcd\">c<g-k>d</g-k></g-co>",
        ]
    );
    assert_eq!(
        host.highlight("root", "abXcd").unwrap(),
        "<g-co v=\"abcd\"><g-k>a</g-k>b</g-co>X<g-co v=\"abcd\">c<g-k>d</g-k></g-co>"
    );
}

#[test]
fn injection_names_can_cross_source_gaps() {
    let root = language(
        "root",
        &["child"],
        json!([{"name":"plain"}]),
        &[[0, 6 << 29], [2, 4 << 29], [3, 0], [9, 5 << 29]],
    );
    let child = language(
        "child",
        &[],
        json!([{"name":"plain"}]),
        &[[0, 7 << 29], [0, 4], [4, 0], [8, 5 << 29]],
    );
    let json = Language::new(
        &std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../dist/json.wasm")).unwrap(),
    )
    .unwrap();
    let mut host = Highlighter::new().unwrap();
    for language in [&root, &child, &json] {
        host.add(language).unwrap();
    }
    assert_eq!(
        host.highlight("root", "jsXonnull").unwrap(),
        "jsXon<g-cb>null</g-cb>"
    );
}
