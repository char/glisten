enable f16;
requires readonly_and_readwrite_storage_textures;

/* Outer comment /* nested comment */ still a comment. */
fn sum(values: array<f32, 4>) -> f32 {
  var result = 0.0f;
  var index = 0u;
  loop {
    result += values[index];
    continuing {
      index += 1u;
      break if index >= 4u;
    }
  }
  return result + f32(0x1p4h);
}
