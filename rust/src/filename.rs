use std::collections::{HashMap, hash_map::Entry};
use std::sync::LazyLock;

use serde::Deserialize;

type Matches = HashMap<String, Option<String>>;

#[derive(Deserialize)]
struct Metadata {
    language: String,
    extensions: Vec<String>,
    filenames: Vec<String>,
}

struct Index {
    filenames: Matches,
    extensions: Matches,
    folded_extensions: Matches,
    longest_extension: usize,
}

static INDEX: LazyLock<Index> = LazyLock::new(|| {
    let catalog: Vec<Metadata> = serde_json::from_str(include_str!("../../_generated/languages.json"))
        .expect("invalid bundled language metadata");
    let mut index = Index {
        filenames: HashMap::new(),
        extensions: HashMap::new(),
        folded_extensions: HashMap::new(),
        longest_extension: 0,
    };
    for Metadata {
        language,
        extensions,
        filenames,
    } in catalog
    {
        for filename in filenames {
            register(&mut index.filenames, &filename, &language);
        }
        for extension in extensions {
            index.longest_extension = index.longest_extension.max(extension.len());
            register(&mut index.extensions, &extension, &language);
            register(
                &mut index.folded_extensions,
                &extension.to_ascii_lowercase(),
                &language,
            );
        }
    }
    index
});

fn register(matches: &mut Matches, key: &str, language: &str) {
    match matches.entry(key.into()) {
        Entry::Vacant(entry) => {
            entry.insert(Some(language.into()));
        }
        Entry::Occupied(mut entry) => {
            if entry.get().as_deref() != Some(language) {
                entry.insert(None);
            }
        }
    }
}

/// Resolve a filename or path to a bundled language without loading any Wasm.
/// Exact basenames win, followed by the longest extension. Extension case is
/// folded only when there is no exact match. Unknown or ambiguous matches return `None`.
pub fn language_for(path: &str) -> Option<&'static str> {
    let index = &*INDEX;
    let basename = path.rsplit(['/', '\\']).next().unwrap_or_default();
    if let Some(named) = index.filenames.get(basename) {
        return named.as_deref();
    }
    let start = basename
        .len()
        .saturating_sub(index.longest_extension + 1)
        .max(1);
    for (dot, _) in basename.match_indices('.').filter(|(dot, _)| *dot >= start) {
        let extension = &basename[dot + 1..];
        if let Some(found) = index.extensions.get(extension) {
            return found.as_deref();
        }
        if let Some(found) = index.folded_extensions.get(&extension.to_ascii_lowercase()) {
            return found.as_deref();
        }
    }
    None
}
