cbuffer Camera : register(b0, space1) {
    float4x4 viewProjection;
};

struct VertexInput {
    float3 position : POSITION;
    float2 uv : TEXCOORD0;
};
struct VertexOutput {
    float4 position : SV_Position;
    float2 uv : TEXCOORD0;
};

VertexOutput main(VertexInput input) {
    VertexOutput output;
    output.position = mul(viewProjection, float4(input.position, 1.0));
    output.uv = input.uv;
    return output;
}
