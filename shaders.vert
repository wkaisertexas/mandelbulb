#version 310 es

precision highp float;
precision highp int;

struct OutputStruct {
    vec4 pos;
    vec2 basePos;
};
struct TimeBuffer {
    float time;
};
layout(location = 0) in vec2 _p2vs_location0;
layout(location = 0) smooth out vec2 _vs2fs_location0;

float hash(float p) {
    return fract((sin(dot(vec2(p), vec2(12.9898, 78.233))) * 43758.547));
}

void main() {
    vec2 pos = _p2vs_location0;
    OutputStruct output_ = OutputStruct(vec4(0.0), vec2(0.0));
    output_.pos = vec4(pos, 0.0, 1.0);
    output_.basePos = pos;
    OutputStruct _e7 = output_;
    gl_Position = _e7.pos;
    _vs2fs_location0 = _e7.basePos;
    gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);
    return;
}

