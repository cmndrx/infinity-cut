import {GRADE_SIZE} from "./grade-texture";

const softwareRenderer = (canvas: HTMLCanvasElement, data: Uint8Array) => {
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("Color processing is unavailable in this browser");
  return {draw: (frame: TexImageSource) => {
    context.drawImage(frame as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i] / 255 * (GRADE_SIZE - 1), g = image.data[i + 1] / 255 * (GRADE_SIZE - 1), b = image.data[i + 2] / 255 * (GRADE_SIZE - 1);
      const ri = Math.floor(r), gi = Math.floor(g), bi = Math.floor(b);
      const rf = r - ri, gf = g - gi, bf = b - bi;
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          const offset = (Math.min(gi + y, GRADE_SIZE - 1) * GRADE_SIZE ** 2 + Math.min(bi + z, GRADE_SIZE - 1) * GRADE_SIZE + Math.min(ri + x, GRADE_SIZE - 1)) * 4;
          value += data[offset + channel] * (x ? rf : 1 - rf) * (y ? gf : 1 - gf) * (z ? bf : 1 - bf);
        }
        image.data[i + channel] = Math.round(value);
      }
    }
    context.putImageData(image, 0, 0);
  }, dispose: () => undefined};
};

export const createGradeRenderer = (canvas: HTMLCanvasElement, data: Uint8Array) => {
  const gl = canvas.getContext("webgl", {premultipliedAlpha: false, preserveDrawingBuffer: true});
  if (!gl) return softwareRenderer(canvas, data);
  const shader = (type: number, source: string) => {
    const result = gl.createShader(type)!;
    gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? "Color shader failed");
    return result;
  };
  const vertex = shader(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);}");
  const fragment = shader(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 uv; uniform sampler2D source; uniform sampler2D grade;
    void main(){vec4 c=texture2D(source,uv);float n=${GRADE_SIZE}.0;vec3 q=clamp(c.rgb,0.0,1.0)*(n-1.0);float b=floor(q.b);
    vec2 a=vec2((b*n+q.r+0.5)/(n*n),(q.g+0.5)/n);vec2 z=vec2((min(b+1.0,n-1.0)*n+q.r+0.5)/(n*n),a.y);
    gl_FragColor=vec4(mix(texture2D(grade,a).rgb,texture2D(grade,z).rgb,fract(q.b)),c.a);}`);
  const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Color shader could not link");
  gl.useProgram(program);
  const buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  const texture = (unit: number) => {
    const result = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  };
  const cube = texture(1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRADE_SIZE ** 2, GRADE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.uniform1i(gl.getUniformLocation(program, "grade"), 1);
  const source = texture(0); gl.uniform1i(gl.getUniformLocation(program, "source"), 0);
  return {
    draw: (frame: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
      gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("GPU color rendering failed");
    },
    dispose: () => { gl.deleteTexture(source); gl.deleteTexture(cube); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); },
  };
};
