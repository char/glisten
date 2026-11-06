#include <cuda_runtime.h>

template <typename T>
__global__ void transform(T* data, int count) {
  int index = blockIdx.x * blockDim.x + threadIdx.x;
  if (index < count) data[index] = __shfl_sync(0xffffffffu, data[index], 0);
}

void run(float* device, int count, cudaStream_t stream) {
  int blocks = (count + 127) / 128;
  transform<float><<<blocks, 128, 0, stream>>>(device, count);
  int shifted = count >> 2;
}
