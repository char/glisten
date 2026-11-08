//! A synchronous host for glisten's shared-memory WebAssembly grammars (ABI 4).
//! Compiled [`Language`]s can be shared between threads; each thread owns a [`Highlighter`].

mod compose;
mod filename;
mod render;
mod runtime;

use std::collections::HashMap;
use std::ops::Range;

use serde::Deserialize;

pub use filename::language_for;
pub use runtime::Language;

pub type Result<T> = anyhow::Result<T>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("resource limit exceeded")]
    Resource,
    #[error("invalid glisten module: {0}")]
    Abi(String),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub abi: u32,
    pub language: String,
    pub aliases: Vec<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub filenames: Vec<String>,
    pub embeds: Vec<String>,
    pub styles: Vec<Style>,
    pub style_map: usize,
    pub area_bytes: usize,
    pub max_depth: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Style {
    pub name: String,
    pub tag: Option<String>,
    pub attribute: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Span {
    pub range: Range<usize>,
    pub style: u16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
    pub range: Range<usize>,
    pub style: u16,
    /// Full logical text when this group is a fragment of a joined document.
    pub value: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Highlight {
    pub spans: Vec<Span>,
    pub groups: Vec<Group>,
    pub missing: Vec<String>,
}

pub struct Highlighter {
    runtime: runtime::Runtime,
    names: HashMap<String, usize>,
    styles: Vec<Style>,
    registered: Vec<bool>,
}

impl Highlighter {
    pub fn new() -> Result<Self> {
        Self::with_memory_limit(64 << 20)
    }

    /// The limit is exact even when it is not a multiple of a WebAssembly page.
    pub fn with_memory_limit(bytes: usize) -> Result<Self> {
        Ok(Self {
            runtime: runtime::Runtime::new(bytes)?,
            names: HashMap::new(),
            styles: vec![Style {
                name: "plain".into(),
                tag: None,
                attribute: None,
            }],
            registered: vec![false],
        })
    }

    pub fn styles(&self) -> &[Style] {
        &self.styles
    }

    pub fn contains(&self, language: &str) -> bool {
        self.names.contains_key(&language.to_ascii_lowercase())
    }

    pub fn add(&mut self, language: &Language) -> Result<()> {
        if self.contains(&language.manifest.language) {
            return Ok(());
        }
        let mut styles = self.styles.clone();
        let mut registered = self.registered.clone();
        let mut mapping = Vec::with_capacity(language.manifest.styles.len());
        for style in &language.manifest.styles {
            let id = match styles.iter().position(|entry| entry.name == style.name) {
                Some(id) => id,
                None => {
                    if styles.len() == 1 << 16 {
                        return Err(Error::Abi("too many styles".into()).into());
                    }
                    styles.push(style.clone());
                    registered.push(false);
                    styles.len() - 1
                }
            };
            if !registered[id] {
                styles[id] = style.clone();
                registered[id] = true;
            }
            mapping.push(id as u16);
        }
        let index = self.runtime.add(language, &mapping)?;
        self.styles = styles;
        self.registered = registered;
        for name in std::iter::once(&language.manifest.language).chain(&language.manifest.aliases) {
            self.names.entry(name.to_ascii_lowercase()).or_insert(index);
        }
        Ok(())
    }

    pub fn process(&mut self, language: &str, source: &str) -> Result<Highlight> {
        let mut result = self.compose(language, source, 0)?;
        // ABI groups arrive inner-first at equal ends; rendering needs outer-first.
        result.groups.reverse();
        result.groups.sort_by(|a, b| {
            a.range
                .start
                .cmp(&b.range.start)
                .then(b.range.end.cmp(&a.range.end))
        });
        Ok(result)
    }

    pub fn highlight(&mut self, language: &str, source: &str) -> Result<String> {
        let result = self.process(language, source)?;
        Ok(self.render(source, &result))
    }

    pub fn render(&self, source: &str, result: &Highlight) -> String {
        self.render_range(source, result, 0..source.len(), result.groups.iter())
    }

    /// Balanced HTML for each line, excluding CR/LF and a final empty line.
    pub fn render_lines(&self, source: &str, result: &Highlight) -> Vec<String> {
        let mut start = 0;
        let mut active = Vec::<&Group>::new();
        let mut next_group = 0;
        source
            .split_inclusive('\n')
            .map(|line| {
                let text = line.strip_suffix('\n').unwrap_or(line);
                let text = text.strip_suffix('\r').unwrap_or(text);
                let end = start + text.len();
                active.retain(|group| group.range.end > start);
                while let Some(group) = result
                    .groups
                    .get(next_group)
                    .filter(|group| group.range.start < end)
                {
                    if group.range.end > start {
                        active.push(group);
                    }
                    next_group += 1;
                }
                let html = self.render_range(source, result, start..end, active.iter().copied());
                start += line.len();
                html
            })
            .collect()
    }
}
