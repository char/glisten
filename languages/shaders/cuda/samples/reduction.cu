#include <cuda_runtime.h>

__global__ __launch_bounds__(256) void reduce(const float* in, float* out) {
  __shared__ float values[256];
  unsigned lane = threadIdx.x;
  values[lane] = in[blockIdx.x * blockDim.x + lane];
  __syncthreads();
  for (unsigned stride = blockDim.x / 2; stride > 0; stride >>= 1) {
    if (lane < stride) values[lane] += values[lane + stride];
    __syncthreads();
  }
  if (lane == 0) atomicAdd(out, values[0]);
}
