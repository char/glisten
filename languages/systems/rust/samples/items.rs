#![allow(dead_code)]
use std::fmt::{self, Display};

/// A reading borrowed from a sensor.
///
/// # Examples
/// ```rust
/// let reading = Reading { name: "café", value: 12 };
/// assert_eq!(reading.value, 12);
/// ```
#[derive(Debug, Clone)]
pub struct Reading<'a> {
    pub name: &'a str,
    pub value: i32,
}

pub trait Describe {
    fn describe(&self) -> String;
}

impl<'a> Describe for Reading<'a> {
    fn describe(&self) -> String {
        format!("{}: {}", self.name, self.value)
    }
}

impl Display for Reading<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.describe())
    }
}

pub fn first<'a, T: Describe>(items: &'a [T]) -> Option<&'a T> {
    items.first()
}

fn scan(values: &[i32]) -> i32 {
    'outer: loop {
        for &value in values {
            if value > 0 { break 'outer value; }
        }
        break 'outer 0;
    }
}
