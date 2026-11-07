use std::sync::OnceLock;

use anyhow::{Context, bail};
use wasmtime::{
    Engine, Global, GlobalType, Linker, Memory, MemoryType, Module, Mutability, Store, TypedFunc,
    Val, ValType,
};

use crate::{Error, Manifest, Result};

const PAGE: usize = 1 << 16;

type Entry = TypedFunc<(i32, i32, i32, i32, i32), i32>;

fn engine() -> &'static Engine {
    static ENGINE: OnceLock<Engine> = OnceLock::new();
    ENGINE.get_or_init(Engine::default)
}

/// Validated metadata and native code; compile once and share across highlighters.
pub struct Language {
    pub(crate) manifest: Manifest,
    module: Module,
}

impl Language {
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn new(bytes: &[u8]) -> Result<Self> {
        let manifest = wasmparser::Parser::new(0)
            .parse_all(bytes)
            .find_map(|payload| match payload {
                Ok(wasmparser::Payload::CustomSection(section)) if section.name() == "glisten" => {
                    Some(serde_json::from_slice::<Manifest>(section.data()))
                }
                _ => None,
            })
            .ok_or_else(|| Error::Abi("missing manifest".into()))?
            .map_err(|error| Error::Abi(error.to_string()))?;
        if manifest.abi != 4 {
            return Err(Error::Abi(format!("module ABI {}, host ABI 4", manifest.abi)).into());
        }
        if manifest.area_bytes % 16 != 0
            || manifest
                .style_map
                .checked_add(manifest.styles.len() * 2)
                .is_none_or(|end| end > manifest.area_bytes)
        {
            return Err(Error::Abi("invalid module area".into()).into());
        }
        for style in &manifest.styles {
            for (value, attribute) in [
                (style.tag.as_deref(), false),
                (style.attribute.as_deref(), true),
            ] {
                if let Some(value) = value {
                    let valid = !value.is_empty()
                        && value.bytes().all(|byte| {
                            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'
                        })
                        && (!attribute || value.as_bytes()[0].is_ascii_lowercase());
                    if !valid {
                        return Err(Error::Abi("unsafe HTML tag or attribute".into()).into());
                    }
                }
            }
        }
        let module = Module::new(engine(), bytes)?;
        Ok(Self { manifest, module })
    }
}

struct InstanceState {
    manifest: Manifest,
    entry: Entry,
    records: Global,
    injections: Global,
    groups: Option<Global>,
    status: Global,
    scratch_required: Option<Global>,
}

pub(crate) struct Call {
    pub records: Vec<[u32; 2]>,
    pub injections: u32,
    pub groups: u32,
}

pub(crate) struct Runtime {
    store: Store<()>,
    memory: Memory,
    instances: Vec<InstanceState>,
    areas_end: usize,
    limit: usize,
}

impl Runtime {
    pub fn new(limit: usize) -> Result<Self> {
        if limit > u32::MAX as usize {
            return Err(Error::Abi("memory limit exceeds wasm32 address space".into()).into());
        }
        let mut store = Store::new(engine(), ());
        let memory = Memory::new(
            &mut store,
            MemoryType::new(1, Some(limit.div_ceil(PAGE).max(1) as u32)),
        )?;
        Ok(Self {
            store,
            memory,
            instances: Vec::new(),
            areas_end: 0,
            limit,
        })
    }

    fn ensure(&mut self, end: usize) -> Result<()> {
        if end > self.limit {
            return Err(Error::Resource.into());
        }
        let pages = end.div_ceil(PAGE);
        let current = self.memory.size(&self.store) as usize;
        if pages > current {
            self.memory
                .grow(&mut self.store, (pages - current) as u64)
                .map_err(|_| Error::Resource)?;
        }
        Ok(())
    }

    pub fn add(&mut self, language: &Language, mapping: &[u16]) -> Result<usize> {
        let base = self.areas_end.next_multiple_of(16);
        let end = base
            .checked_add(language.manifest.area_bytes)
            .ok_or(Error::Resource)?;
        self.ensure(end)?;
        let global = Global::new(
            &mut self.store,
            GlobalType::new(ValType::I32, Mutability::Const),
            Val::I32(base as i32),
        )?;
        let mut linker = Linker::new(engine());
        linker.define(&self.store, "env", "memory", self.memory)?;
        linker.define(&self.store, "env", "base", global)?;
        let instance = linker.instantiate(&mut self.store, &language.module)?;
        let offset = base + language.manifest.style_map;
        for (i, style) in mapping.iter().enumerate() {
            self.memory
                .write(&mut self.store, offset + i * 2, &style.to_le_bytes())?;
        }
        let state = InstanceState {
            manifest: language.manifest.clone(),
            entry: instance.get_typed_func(&mut self.store, "highlight")?,
            records: instance
                .get_global(&mut self.store, "records")
                .context("missing records export")?,
            injections: instance
                .get_global(&mut self.store, "injections")
                .context("missing injections export")?,
            groups: instance.get_global(&mut self.store, "groups"),
            status: instance
                .get_global(&mut self.store, "status")
                .context("missing status export")?,
            scratch_required: instance.get_global(&mut self.store, "scratchRequired"),
        };
        let index = self.instances.len();
        self.instances.push(state);
        self.areas_end = end;
        Ok(index)
    }

    pub fn manifest(&self, index: usize) -> &Manifest {
        &self.instances[index].manifest
    }

    pub fn call(&mut self, index: usize, source: &str) -> Result<Call> {
        let input = self.areas_end.next_multiple_of(16);
        let documents = input
            .checked_add(source.len())
            .and_then(|end| end.checked_add(16))
            .ok_or(Error::Resource)?
            .next_multiple_of(4);
        let output = documents.checked_add(8).ok_or(Error::Resource)?;
        self.ensure(output)?;
        self.memory
            .write(&mut self.store, input, source.as_bytes())?;
        self.memory.data_mut(&mut self.store)[input + source.len()..documents].fill(0);
        self.memory
            .write(&mut self.store, documents, &0u32.to_le_bytes())?;
        self.memory.write(
            &mut self.store,
            documents + 4,
            &(source.len() as u32).to_le_bytes(),
        )?;
        let state = &self.instances[index];
        let result = state.entry.call(
            &mut self.store,
            (
                input as i32,
                source.len() as i32,
                documents as i32,
                1,
                output as i32,
            ),
        );
        let status = state
            .status
            .get(&mut self.store)
            .i32()
            .context("invalid status export")?;
        let code = match result {
            Ok(code) => code,
            Err(_) if status == 1 => return Err(Error::Resource.into()),
            Err(error) => return Err(error.into()),
        };
        if code == 1 {
            return Err(Error::Resource.into());
        }
        if code != 0 {
            bail!("unknown glisten status {code}");
        }
        let count = state
            .records
            .get(&mut self.store)
            .i32()
            .context("invalid records export")? as u32 as usize;
        let end = output
            .checked_add(count.checked_mul(8).ok_or(Error::Resource)?)
            .ok_or(Error::Resource)?;
        if let Some(scratch) = state.scratch_required {
            let required = scratch
                .get(&mut self.store)
                .i64()
                .context("invalid scratchRequired export")? as u64;
            if required > self.limit as u64 {
                return Err(Error::Resource.into());
            }
        }
        if end > self.limit {
            return Err(Error::Resource.into());
        }
        let injections = state
            .injections
            .get(&mut self.store)
            .i32()
            .context("invalid injections export")? as u32;
        let groups = state
            .groups
            .map(|global| {
                global
                    .get(&mut self.store)
                    .i32()
                    .context("invalid groups export")
            })
            .transpose()?
            .unwrap_or(0) as u32;
        let bytes = self
            .memory
            .data(&self.store)
            .get(output..end)
            .context("records exceed guest memory")?;
        let records = bytes
            .chunks_exact(8)
            .map(|record| {
                [
                    u32::from_le_bytes(record[..4].try_into().unwrap()),
                    u32::from_le_bytes(record[4..].try_into().unwrap()),
                ]
            })
            .collect();
        Ok(Call {
            records,
            injections,
            groups,
        })
    }
}
