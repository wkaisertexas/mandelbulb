/// Goal: create a webgpu impl of the mandelbulb fractal
/// Source: https://iquilezles.org/articles/mandelbulb/
// import WebMWriter from "webm-writer";

let FPS = 20;
let mean = 0.0;
let numTimes = 0;

const canvas = document.querySelector("canvas");
canvas.width = 1024;
canvas.height = 1024;

let device, videoWriter, renderPipeline, time, context, vertexBuffer, vertices;

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
    label: "Cell verticies", // I think this is for debug purposes only -> shows up in error messages
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  time = device.createBuffer({
    label: "Time buffer",
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

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
};

setup();

const render = async () => {
  // write the time buffer

  const timeBuffer = new Float32Array([performance.now() / 1000]);
  if (!paused) {
    device.queue.writeBuffer(time, 0, timeBuffer);
  }

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
