#define USE_TEXTURE 1
Texture2D<float4> albedo : register(t0);
SamplerState linearSampler : register(s0);

float4 main(float2 uv : TEXCOORD0, float4 position : SV_Position) : SV_Target0 {
    float4 surface = albedo.Sample(linearSampler, uv);
    float light = saturate(dot(surface.xyz, float3(0.3, 0.5, 0.2)));
    [branch] if (position.x < 1.0) discard;
    return lerp(surface, float4(light, light, light, 1.0), 0.25);
}
