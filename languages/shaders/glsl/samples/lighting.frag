#version 320 es
#extension GL_EXT_shader_texture_lod : enable
precision highp float;

layout(location = 0) in vec2 texCoord;
layout(location = 1) flat in vec3 normal;
layout(location = 0) out vec4 color;
uniform sampler2D albedo;
uniform vec3 lightDirection;

void main() {
    vec3 surface = texture(albedo, texCoord).rgb;
    float diffuse = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
    vec3 lit = mix(surface * 0.1, surface, clamp(diffuse, 0.0, 1.0));
    color = vec4(lit, 1.0);
    if (gl_FragCoord.x < 1.0) discard;
}
