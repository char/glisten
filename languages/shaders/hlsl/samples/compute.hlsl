RWStructuredBuffer<float4> particles : register(u0);
RWByteAddressBuffer counter : register(u1, space1);
groupshared uint completed;

[numthreads(8, 8, 1)]
void main(uint3 id : SV_DispatchThreadID, uint lane : SV_GroupIndex) {
    if (lane == 0) completed = 0;
    GroupMemoryBarrierWithGroupSync();
    [unroll] for (uint i = 0; i < 4; ++i) {
        particles[id.x].xyz += float3(0.01, 0.0, 0.0);
    }
    counter.InterlockedAdd(0, 1);
}
