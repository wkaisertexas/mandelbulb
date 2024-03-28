/// Goal: create a webgpu impl of the mandelbulb fractal
/// Source: https://iquilezles.org/articles/mandelbulb/
// import WebMWriter from "webm-writer";

let FPS = 20;
let mean = 0.0;
let numTimes = 0;

const canvas = document.querySelector("canvas");
canvas.width = 1024;
canvas.height = 1024;

// webgpu constructs
let device, videoWriter, renderPipeline, time, context, vertexBuffer, vertices, rotation;

// user input constructs
let isMouseDown = false;
let priorX = 0;
let priorY = 0;

let targetX = 0;
let targetY = 0;

let currentX = 0;
let currentY = 0;

let pauseDuration = 0;
let priorTime = 0;

const setup = async () => {
  if (!navigator.gpu) {
    alert("WebGPU is not supported in your browser - Try the latest version of Chrome or Microsoft Edge");
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();

  device = await adapter.requestDevice({
    powerPreference: "high-performance",
  });

  const shaders = await (await fetch("shaders.wgsl")).text();

  context = canvas.getContext("webgpu");
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    // tells the canvas that you will receive data from this `device` in this `format`
    device: device,
    format: canvasFormat,
  });

  // videoWriter = new WebMWriter({
  //   quality: 1.0,
  //   frameRate: FPS,
  // });

  // with the device, setup a render pipeline

  // vertex buffer
  vertices = new Float32Array([
    -1, -1, 1, 1, 1, -1,

    -1, -1, 1, 1, -1, 1,
  ]);

  vertexBuffer = device.createBuffer({
    label: "Cell vertices", // I think this is for debug purposes only -> shows up in error messages
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  time = device.createBuffer({
    label: "Time buffer",
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  rotation = device.createBuffer({
    label: "Mouse Rotation",
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(rotation, 0, new Float32Array([0, 0]));
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  // layout

  const vertexBufferLayout = {
    arrayStride: 8, // each vertex is 2 floats which are each two bytes, so each point is 8 bytes
    attributes: [
      {
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
      },
    ],
  };

  // shader module

  const shaderModule = device.createShaderModule({
    label: "Mandelbulb shader module",
    code: shaders,
  });

  // create pipeline
  renderPipeline = device.createRenderPipeline({
    label: "set pipeline",
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertexShader",
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentShader",
      targets: [
        {
          format: canvasFormat,
        },
      ],
    },
  });
  setInterval(render, 1000 / FPS);

  // setting up mouse listeners
  canvas.addEventListener('mousedown', mouseDown);

  // both leaving and not clicking stop the animation from being interactive
  canvas.addEventListener('mouseup', mouseUp);
  canvas.addEventListener('mouseleave', mouseUp); 

  // dragging the mouse
  canvas.addEventListener('mousemove', canvasDragged);
};

setup();

const canvasDragged = (event) => {
    if(!isMouseDown) return; // do nothing

    let diffX = event.clientX - priorX;
    let diffY = event.clientY - priorY;

    const rect = canvas.getBoundingClientRect();
    priorX = event.clientX - rect.left;
    priorY = event.clientY - rect.top;

    // scale down diffX and diffY
    targetX += diffX / canvas.width;
    targetY += diffY / canvas.height;

    console.log("Canvas dragged!");
};

const mouseUp = (event) => {
  isMouseDown = false;
  console.log("Mouse up!");
};

const mouseDown = (event) => {
  isMouseDown = true;

  const rect = canvas.getBoundingClientRect();
  priorX = event.clientX - rect.left;
  priorY = event.clientY - rect.top;
  console.log("Mouse down!");
};

const render = async () => {
  // write the time buffer

  const timeBuffer = new Float32Array([performance.now() / 1000 - pauseDuration]);

  if (!paused) {
    device.queue.writeBuffer(time, 0, timeBuffer);
  } else {
    pauseDuration += performance.now() / 1000 - priorTime;
  }

  priorTime = performance.now() / 1000;

  // update current from target
  currentX -= (currentX - targetX) * 0.1;
  currentY -= (currentY - targetY) * 0.1;
  let rotationBuffer = new Float32Array([currentY, -1 *currentX]);
  device.queue.writeBuffer(rotation, 0, rotationBuffer);

  // create the bind group for the time buffer
  const bindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: time,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: rotation,
        },
      },
    ],
  });

  // actual render function
  let begin = performance.now();

  // creating an encoder
  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: "clear", // no persistence of data
        clearValue: { r: 0, g: 0, b: 0.4, a: 1 },
        storeOp: "store", // at the end of the render pass, store the result into the texture
      },
    ],
  });

  pass.setBindGroup(0, bindGroup);
  pass.setPipeline(renderPipeline);
  pass.setVertexBuffer(0, vertexBuffer);

  pass.draw(vertices.length / 2, 1);

  pass.end();

  // submitting the render pass
  device.queue.submit([encoder.finish()]);

  await device.queue.onSubmittedWorkDone();

  let elapsed = performance.now() - begin;

  mean = (mean * numTimes + elapsed) / (numTimes + 1);
  numTimes += 1;
};

// scheduling the interval
let paused = false;

// for (let i = 0; i < 30; i++) {
//   render();
//   videoWriter.addFrame(canvas);
// }

// videoWriter.complete().then(function (webMBlob) {
//   const a = document.createElement("a");

//   const url = URL.createObjectURL(webMBlob);
//   a.download = "video.webm";
//   a.href = url;
//   a.action = "download";
//   //
//   a.click();

//   URL.revokeObjectURL(href);
// });

// render();
document.addEventListener("keydown", (e) => {
  paused = e.key === " " ? !paused : paused;
});
