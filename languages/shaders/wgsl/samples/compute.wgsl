@group(0) @binding(0) var<storage, read_write> data: array<u32>;
override workgroup_size: u32 = 64u;

@compute @workgroup_size(workgroup_size)
fn increment(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < arrayLength(&data)) {
    data[id.x] += 1u;
  }
}
