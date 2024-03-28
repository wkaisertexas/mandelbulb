 struct OutputStruct{
  @builtin(position) pos: vec4f,
  @location(0) basePos: vec2f
}

@vertex
fn vertexShader(@location(0) pos: vec2f) -> OutputStruct {
  var output: OutputStruct;
  output.pos = vec4f(pos, 0.0, 1.0);
  output.basePos = pos;
  return output;
}

struct TimeBuffer {
  time : f32
};

struct RotationBuffer {
  x : f32,
  y : f32,
};

@binding(0) @group(0)var<uniform> timeBuffer : TimeBuffer;
@binding(1) @group(0)var<uniform> rotationBuffer : RotationBuffer;

fn getNormal(pos: vec3f) -> vec3f {
  let h = 0.0000001;
  let k = vec2f(1.0, -1.0);

  let zero = vec3f(0.0, 0.0, 0.0);

  return normalize(
    k.xyy * map(pos + k.xyy * h, zero)[3] +
    k.yyx * map(pos + k.yyx * h, zero)[3] +
    k.yxy * map(pos + k.yxy * h, zero)[3] +
    k.xxx * map(pos + k.xxx * h, zero)[3]
  );
}

/// Generates random numbers
fn hash(p: f32) -> f32 {
  return fract(sin(dot(vec2f(p), vec2f(12.9898, 78.233))) * 43758.5453);    
}

fn rotateX(vec: vec3<f32>, angle: f32) -> vec3<f32> {
    let cosAngle = cos(angle);
    let sinAngle = sin(angle);
    let rotMatrix = mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, cosAngle, -sinAngle),
        vec3<f32>(0.0, sinAngle, cosAngle)
    );
    return rotMatrix * vec;
}

// Function to rotate a 3D vector around the y-axis
fn rotateY(vec: vec3<f32>, angle: f32) -> vec3<f32> {
    let cosAngle = cos(angle);
    let sinAngle = sin(angle);
    let rotMatrix = mat3x3<f32>(
        vec3<f32>(cosAngle, 0.0, sinAngle),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(-sinAngle, 0.0, cosAngle)
    );
    return rotMatrix * vec;
}

fn rotate_point(point: vec3f, angle: RotationBuffer) -> vec3f {
  return rotateX(rotateY(point, angle.y), angle.x);
}

fn map(pos: vec3f, in_out: vec3f) -> vec4f {
  let rotatedPos = rotate_point(pos, rotationBuffer);

  let thresh = length(pos) - 1.2;

  if(thresh > 0.2) {
     return vec4f(in_out, thresh);
  }

  let power = 8.0 + 2.0 * sin(0.25 * timeBuffer.time);
  var z = rotatedPos;
  var c = rotatedPos;

  var trap = vec3f(1e20);

  var dr : f32 = 1.0;
  var r = length(z);

  var numIter = 0;
  for(var i = 0; i < 100; i++){
    r = length(z); // length of pos is close to zero
    if(r > 2.0) { break; } // this would get triggered instantly
    var theta: f32 = acos(z.z / r);
    var phi: f32 = atan2(z.y, z.x);

    dr = pow(r, power - 1.0) * power * dr + 1.0;

    var zr = pow(r, power);
    theta *= power;
    phi *= power;

    z = vec3f(
      zr * sin(theta) * sin(phi),
      zr * sin(theta) * cos(phi),
      zr * cos(theta)
    );
    z += c;

    //trap.x = min(abs(z.z), trap.x);
    //trap.y = min(abs(z.y), trap.y);
    //trap.z = min(abs(z.z), trap.z); 
    trap.x = min(pow(abs(z.z), 0.1), trap.x);
    trap.y = min(abs(z.x) - 0.15, trap.y);
    trap.z = min(length(z), trap.z);
  } 

  let distance = 0.5 * log(r) * r / dr; // 0.5 * log ( z ) // not used at all -> does not matter
  return vec4f(trap, distance);

/*
  let thres = length(pos);
  if( thres > 1.41 ) {
    return 4(in_out, thres - 1.2);
  }

  var z = pos;
  var c = pos;

  let power = 12.0;
  var dr = 1.0;
  var r = 0.0;

  var newOutput = vec3f(1e20);

  for(var i = 0; i < 100; i++) {
    r = length(z);
    if(r > 2.0) { break; }

    dr = pow(r, power - 1.0 ) * power * dr + 1.0;

    // scale and rotate
    let zr = pow(r, power);
    let theta = acos(z.y / r) * power;
    let phi = atan2(z.x, z.z) * power; // gonna get mad at the div by zero

    // convert to cartesian
    let z = zr * vec3f(
      sin(theta) * sin(phi),
      cos(theta),
      sin(theta) * cos(phi)
    );
    // updating the "trap"
    newOutput.x = min(pow(abs(z.y), 0.1), newOutput.x);
    newOutput.y = min(abs(z.z) - 0.15, newOutput.y);
    newOutput.z = min(length(z), newOutput.z);
  }
  
  let float_return = 0.5 * log(r) * r / dr;
  return vec4f(newOutput, float_return);
*/
}

fn ambientOcclusion(pos: vec3f, normal: vec3f) -> f32 {
  let FALLOFF = 0.46;
  let N_SAMPLES = 12;
  let MAX_DIST = 0.07; 

  var diff = 0.0;
  for (var i = 0; i < N_SAMPLES; i++){
    let dist = MAX_DIST  * hash(f32(i));
    let sample_distance = max(0.0, map(pos + dist * normal, vec3f(0.0))[3]);
      
    diff += (dist - sample_distance) / MAX_DIST;
  }

  let diff_norm = diff / f32(N_SAMPLES);
  let ao = 1.0 - diff_norm / FALLOFF;

  return clamp(0.0, 1.0, ao);
}


// TODO: IMPL of a "trap" which goes in and out needs to be done with structs (or maybe packing), regardless that will be a pain -> less of a pain because just a float and a vector -> just use a vec4f and then "unpack" it into a vec3f and a f32, no different than having an amplitude
fn castRay(rayOrigin: vec3f, rayDirection: vec3f) -> vec4f {
  let tmax = 200.0;
  
  var t = 0.0;
  
  var trap = vec3f(0.5);
    
  for(var i = 0; i < 100; i++){
    let pos = rayOrigin + t * rayDirection; // for some reason, rayDirection is acting like it does not exist

    let mapResult = map(pos, trap);
    trap = mapResult.xyz;
    var h: f32 = mapResult[3];

    if ( h < 0.0003 ) { break; }
    
    t += h;
    if ( t > tmax ) {
      return vec4f(trap, -1.0); // negatives just serve as an if flag 
    }
  }
  return vec4f(trap, t);
}

// setup a time bind

@fragment
fn fragmentShader(@location(0) basePos: vec2f) -> @location(0) vec4f {
  let freq = 50.0 + timeBuffer.time * 3;

  var cam_pos = vec3f(
    3.0 * cos(0.1 * 0.125 * freq) * sin(0.1 * 0.5 * freq),
    sin(0.1 * freq),
    2.0 * cos(0.1 * 0.5 * freq)
  );

  cam_pos *= 1.1;

  let cam_target = vec3f(0.0);
  let fov = 110.0 * 3.141592 / 180.0; 
  let h = 1.0 * fov;
  
  let cam_ww = normalize(cam_target - cam_pos);
  let cam_uu = normalize(cross(vec3f(0.0, 1.0, 0.0), cam_ww));
  let cam_vv = normalize(cross(cam_ww, cam_uu));
    
  // the code already gives you acces to the basePos: vec2f so there is no need to use it as x
  let ro = cam_pos;
  let rd = normalize(basePos.x * h * cam_uu + basePos.y * h * cam_vv + cam_ww - ro); // no idea

  let rayCastResult = castRay(cam_pos, rd);
  let finalRayPos = rayCastResult.xyz;
  let t = rayCastResult[3]; // returning a uniform value

  if ( t > 0.0 ) {
    // coloring the ray
      
    let first_palette = vec3f(0.373, 0.18, 0.18);
    let second_palette = vec3f(0.165, 0.125, 0.165);
    let third_palette = vec3f(0.545, 0.255, 0.212);

    let rayMult = clamp(pow(finalRayPos, vec3f(20.0)), vec3f(0.0), vec3f(1.0));

    // let finalColor = first_palette * rayMult.x + second_palette * rayMult.y + third_palette * rayMult.z;
    let finalColor = rayMult;

    // let normal = getNormal(ro + t * rd);

    //let ao = ambientOcclusion(ro + t * rd, normal);
      
    return vec4f(pow(finalColor, vec3f(0.4545)), 1.0);
    // return vec4f((normal + 1) / 2, 1);
    // return vec4f(normal * finalColor, 1);
    // return vec4f(normal, 1); // normals look weird because they are not being taken from a point on the surface, the sides are only shown 
  } else {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
}
