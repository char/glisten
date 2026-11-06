struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  let x = f32(index);
  return VertexOutput(vec4f(x, 0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0));
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}
