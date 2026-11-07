use std::ops::Range;

use anyhow::{Context, ensure};

use crate::{Error, Group, Highlight, Highlighter, Result, Span};

#[derive(Default)]
struct Injection {
    language: String,
    pieces: Vec<Range<usize>>,
}

enum Part {
    Span(Span),
    Group(Group),
    Segment {
        injection: usize,
        range: Range<usize>,
    },
}

impl Highlighter {
    pub(crate) fn compose(
        &mut self,
        language: &str,
        source: &str,
        depth: usize,
    ) -> Result<Highlight> {
        if source.is_empty() {
            return Ok(Highlight::default());
        }
        let Some(&index) = self.names.get(&language.to_ascii_lowercase()) else {
            return Ok(Highlight {
                spans: vec![Span {
                    range: 0..source.len(),
                    style: 0,
                }],
                missing: if language.is_empty() {
                    vec![]
                } else {
                    vec![language.into()]
                },
                ..Highlight::default()
            });
        };
        if depth >= 128 {
            return Err(Error::Resource.into());
        }
        let call = self.runtime.call(index, source)?;
        let records = call.records;
        if call.injections == 0 && call.groups == 0 {
            let mut start = 0;
            let spans = records
                .into_iter()
                .map(|[end, style]| {
                    let range = start..end as usize;
                    start = range.end;
                    Span {
                        range,
                        style: style as u16,
                    }
                })
                .collect();
            return Ok(Highlight {
                spans,
                ..Highlight::default()
            });
        }
        let manifest = self.runtime.manifest(index);
        let mut injections = Vec::<Injection>::new();
        let mut parts = Vec::with_capacity(records.len());
        let mut position = 0;
        let mut at = 0;
        while at < records.len() {
            let [value, word] = records[at];
            let kind = word >> 29;
            let payload = (word & 0x1fff_ffff) as usize;
            let value = value as usize;
            match kind {
                0 | 4 | 5 => {
                    ensure!(
                        position < value && value <= source.len(),
                        "invalid record range"
                    );
                    let range = position..value;
                    if kind == 0 {
                        ensure!(payload < self.styles.len(), "invalid style ID");
                        parts.push(Part::Span(Span {
                            range,
                            style: payload as u16,
                        }));
                    } else {
                        injections
                            .get_mut(payload)
                            .context("unknown injection")?
                            .pieces
                            .push(range.clone());
                        parts.push(Part::Segment {
                            injection: payload,
                            range,
                        });
                    }
                    position = value;
                }
                2 => {
                    ensure!(
                        value < position && payload < self.styles.len(),
                        "invalid group"
                    );
                    parts.push(Part::Group(Group {
                        range: value..position,
                        style: payload as u16,
                        value: None,
                    }));
                }
                6 | 7 => {
                    ensure!(payload == injections.len(), "nonsequential injection ID");
                    let language = if kind == 6 {
                        manifest
                            .embeds
                            .get(value)
                            .context("invalid embed index")?
                            .clone()
                    } else {
                        at += 1;
                        let [start, end] = *records.get(at).context("missing injection name")?;
                        source
                            .get(start as usize..end as usize)
                            .context("invalid injection name")?
                            .to_owned()
                    };
                    injections.push(Injection {
                        language,
                        pieces: vec![],
                    });
                }
                _ => return Err(Error::Abi(format!("unknown record kind {kind}")).into()),
            }
            at += 1;
        }
        ensure!(position == source.len(), "records do not tile source");
        let mut children = Vec::with_capacity(injections.len());
        for injection in &injections {
            let text = injection
                .pieces
                .iter()
                .map(|range| &source[range.clone()])
                .collect::<String>();
            let mut child = self.compose(&injection.language, &text, depth + 1)?;
            let mut mapped = Highlight {
                missing: child.missing,
                ..Highlight::default()
            };
            for span in child.spans {
                for range in map_range(&injection.pieces, &span.range) {
                    mapped.spans.push(Span {
                        range,
                        style: span.style,
                    });
                }
            }
            for group in child.groups.drain(..) {
                let ranges = map_range(&injection.pieces, &group.range);
                let value = group
                    .value
                    .or_else(|| (ranges.len() > 1).then(|| text[group.range.clone()].to_owned()));
                for range in ranges {
                    mapped.groups.push(Group {
                        range,
                        style: group.style,
                        value: value.clone(),
                    });
                }
            }
            children.push(mapped);
        }
        let mut result = Highlight::default();
        let mut cursors = vec![0; children.len()];
        for part in parts {
            match part {
                Part::Span(span) => push_span(&mut result.spans, span),
                Part::Group(group) => result.groups.push(group),
                Part::Segment { injection, range } => {
                    let child = &children[injection];
                    let cursor = &mut cursors[injection];
                    while let Some(span) = child
                        .spans
                        .get(*cursor)
                        .filter(|span| span.range.start < range.end)
                    {
                        push_span(&mut result.spans, span.clone());
                        *cursor += 1;
                    }
                    result.groups.extend(
                        child
                            .groups
                            .iter()
                            .filter(|group| {
                                range.start <= group.range.start && group.range.end <= range.end
                            })
                            .cloned(),
                    );
                }
            }
        }
        for child in children {
            for name in child.missing {
                if !result.missing.contains(&name) {
                    result.missing.push(name);
                }
            }
        }
        Ok(result)
    }
}

fn push_span(spans: &mut Vec<Span>, span: Span) {
    if let Some(last) = spans
        .last_mut()
        .filter(|last| last.style == span.style && last.range.end == span.range.start)
    {
        last.range.end = span.range.end;
    } else {
        spans.push(span);
    }
}

fn map_range(pieces: &[Range<usize>], range: &Range<usize>) -> Vec<Range<usize>> {
    let mut offset = 0;
    let mut mapped = Vec::new();
    for piece in pieces {
        let end = offset + piece.len();
        if range.start < end && range.end > offset {
            mapped.push(
                piece.start + range.start.saturating_sub(offset)
                    ..piece.start + (range.end.min(end) - offset),
            );
        }
        offset = end;
        if offset >= range.end {
            break;
        }
    }
    mapped
}
