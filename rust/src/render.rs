use std::ops::Range;

use crate::{Group, Highlight, Highlighter};

impl Highlighter {
    pub(crate) fn render_range<'a>(
        &self,
        source: &str,
        result: &Highlight,
        range: Range<usize>,
        groups: impl IntoIterator<Item = &'a Group>,
    ) -> String {
        if range.is_empty() {
            return String::new();
        }
        let mut html = String::with_capacity(range.len() * 2);
        let groups = groups
            .into_iter()
            .filter(|group| {
                group.range.start < range.end
                    && range.start < group.range.end
                    && self.styles[group.style as usize].tag.is_some()
            })
            .collect::<Vec<_>>();
        let mut next_group = 0;
        let mut stack = Vec::<&Group>::new();
        let mut span = result
            .spans
            .partition_point(|span| span.range.end <= range.start);
        let mut position = range.start;
        while position < range.end {
            while stack
                .last()
                .is_some_and(|group| group.range.end <= position)
            {
                let group = stack.pop().unwrap();
                tag(
                    &mut html,
                    self.styles[group.style as usize].tag.as_deref().unwrap(),
                    true,
                );
            }
            while let Some(&group) = groups
                .get(next_group)
                .filter(|group| group.range.start <= position)
            {
                let style = &self.styles[group.style as usize];
                html.push_str("<g-");
                html.push_str(style.tag.as_deref().unwrap());
                if let Some(attribute) = &style.attribute {
                    html.push(' ');
                    html.push_str(attribute);
                    html.push_str("=\"");
                    escape(
                        &mut html,
                        group
                            .value
                            .as_deref()
                            .unwrap_or(&source[group.range.clone()]),
                        true,
                    );
                    html.push('"');
                }
                html.push('>');
                stack.push(group);
                next_group += 1;
            }
            let current = &result.spans[span];
            let mut end = current.range.end.min(range.end);
            if let Some(group) = groups.get(next_group) {
                end = end.min(group.range.start);
            }
            if let Some(group) = stack.last() {
                end = end.min(group.range.end);
            }
            let style = &self.styles[current.style as usize];
            if let Some(name) = &style.tag {
                tag(&mut html, name, false);
            }
            escape(&mut html, &source[position..end], false);
            if let Some(name) = &style.tag {
                tag(&mut html, name, true);
            }
            position = end;
            if end == current.range.end {
                span += 1;
            }
        }
        for group in stack.into_iter().rev() {
            tag(
                &mut html,
                self.styles[group.style as usize].tag.as_deref().unwrap(),
                true,
            );
        }
        html
    }
}

fn tag(html: &mut String, name: &str, close: bool) {
    html.push_str(if close { "</g-" } else { "<g-" });
    html.push_str(name);
    html.push('>');
}

fn escape(html: &mut String, text: &str, attribute: bool) {
    let mut start = 0;
    for (i, byte) in text.bytes().enumerate() {
        let entity = match byte {
            b'&' => "&amp;",
            b'<' => "&lt;",
            b'>' => "&gt;",
            b'"' if attribute => "&quot;",
            _ => continue,
        };
        html.push_str(&text[start..i]);
        html.push_str(entity);
        start = i + 1;
    }
    html.push_str(&text[start..]);
}
