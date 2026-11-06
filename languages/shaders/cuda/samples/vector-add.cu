#include <cuda_runtime.h>

__global__ void add(const float4* a, const float4* b, float4* out, unsigned n) {
  unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) {
    out[i] = make_float4(a[i].x + b[i].x, a[i].y + b[i].y, 0.0f, 1.0f);
  }
}

void launch(const float4* a, const float4* b, float4* out, unsigned n) {
  dim3 threads(256);
  dim3 blocks((n + 255) / 256);
  add<<<blocks, threads>>>(a, b, out, n);
}
