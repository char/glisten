use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use glisten::{Error, Highlighter, Language};

fn languages() -> &'static Vec<Language> {
    static LANGUAGES: OnceLock<Vec<Language>> = OnceLock::new();
    LANGUAGES.get_or_init(|| {
        let dist = Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist");
        let mut paths = fs::read_dir(dist)
            .expect("run `avril task build` first")
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "wasm")
            })
            .collect::<Vec<_>>();
        paths.sort();
        assert!(!paths.is_empty(), "run `avril task build` first");
        paths
            .iter()
            .map(|path| {
                Language::new(&fs::read(path).unwrap())
                    .unwrap_or_else(|error| panic!("{}: {error:#}", path.display()))
            })
            .collect()
    })
}

fn highlighter() -> Highlighter {
    let mut host = Highlighter::new().unwrap();
    for language in languages() {
        host.add(language).unwrap();
    }
    host
}

#[test]
fn matches_language_snapshots() {
    let mut host = highlighter();
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../languages");
    let mut count = 0;
    for entry in walkdir::WalkDir::new(root) {
        let path = entry.unwrap().into_path();
        if path.extension().is_none_or(|extension| extension != "html") {
            continue;
        }
        let Some(source_path) = path.to_str().unwrap().strip_suffix(".html") else {
            continue;
        };
        if !Path::new(source_path).is_file() {
            continue;
        }
        let language = path
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .file_name()
            .unwrap()
            .to_str()
            .unwrap();
        assert!(
            host.contains(language),
            "missing grammar: {language}; run `avril task build`"
        );
        let source = fs::read_to_string(source_path).unwrap();
        let result = host
            .process(language, &source)
            .unwrap_or_else(|error| panic!("{}: {error:#}", path.display()));
        assert_eq!(
            host.render(&source, &result),
            fs::read_to_string(&path).unwrap(),
            "{}",
            path.display()
        );
        let mut end = 0;
        for span in &result.spans {
            assert_eq!(span.range.start, end);
            assert!(span.range.end > end && source.is_char_boundary(span.range.end));
            end = span.range.end;
        }
        assert_eq!(end, source.len());
        count += 1;
    }
    assert!(count > 300, "only tested {count} samples");
}

#[test]
fn missing_languages_and_empty_sources() {
    let mut host = Highlighter::new().unwrap();
    assert_eq!(
        host.highlight("missing", "<猫&>\"💜").unwrap(),
        "&lt;猫&amp;&gt;\"💜"
    );
    assert_eq!(
        host.process("missing", "hello").unwrap().missing,
        ["missing"]
    );
    assert!(host.process("missing", "").unwrap().spans.is_empty());
    assert_eq!(
        host.render_lines("", &Default::default()),
        Vec::<String>::new()
    );
}

#[test]
fn line_rendering_balances_multiline_spans_and_groups() {
    let mut host = highlighter();
    let source = "/* <\n猫 & */\r\nlet x = 1;\n";
    let result = host.process("javascript", source).unwrap();
    assert_eq!(
        host.render_lines(source, &result),
        [
            "<g-c>/* &lt;</g-c>",
            "<g-c>猫 &amp; */</g-c>",
            "<g-k>let</g-k> <g-v>x</g-v> <g-o>=</g-o> <g-n>1</g-n><g-pd>;</g-pd>",
        ]
    );
    let source = "#abc";
    let result = host.process("css", source).unwrap();
    assert_eq!(
        host.render_lines(source, &result),
        [host.render(source, &result)]
    );
}

#[test]
fn memory_exhaustion_does_not_poison_later_calls() {
    let json = languages()
        .iter()
        .find(|language| language.manifest().language == "json")
        .unwrap();
    let mut host = Highlighter::with_memory_limit(128 << 10).unwrap();
    host.add(json).unwrap();
    let error = host.process("json", &" ".repeat(256 << 10)).unwrap_err();
    assert!(matches!(
        error.downcast_ref::<Error>(),
        Some(Error::Resource)
    ));
    let source = format!("[{}0]", "0,".repeat(30_000));
    let error = host.process("json", &source).unwrap_err();
    assert!(matches!(
        error.downcast_ref::<Error>(),
        Some(Error::Resource)
    ));
    assert_eq!(host.highlight("JSON", "null").unwrap(), "<g-cb>null</g-cb>");
}

#[test]
fn logical_memory_limits_are_not_page_rounded() {
    let json = languages()
        .iter()
        .find(|language| language.manifest().language == "json")
        .unwrap();
    let end = json.manifest().area_bytes + 36;
    for (limit, succeeds) in [(end, true), (end - 1, false)] {
        let mut host = Highlighter::with_memory_limit(limit).unwrap();
        host.add(json).unwrap();
        let result = host.process("json", "null");
        assert_eq!(result.is_ok(), succeeds);
        if let Err(error) = result {
            assert!(matches!(
                error.downcast_ref::<Error>(),
                Some(Error::Resource)
            ));
        }
    }
}

#[test]
fn rejects_missing_manifest() {
    assert!(matches!(
        Language::new(b"\0asm\x01\0\0\0")
            .err()
            .unwrap()
            .downcast_ref::<Error>(),
        Some(Error::Abi(_))
    ));
}
