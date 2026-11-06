#version 460 core

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 0) out vec3 worldNormal;

layout(std140, binding = 0) uniform Camera {
    mat4 viewProjection;
    mat4 model;
} camera;

void main() {
    vec4 worldPosition = camera.model * vec4(position, 1.0);
    worldNormal = mat3(camera.model) * normal;
    gl_Position = camera.viewProjection * worldPosition;
}
