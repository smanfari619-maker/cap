import { type Lut3D } from './lut-solver';

export class WebGLPipeline {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private currentLutText: string | null = null;

  constructor() {}

  private init(): boolean {
    if (this.gl) return true;
    
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!this.gl) {
      console.warn('WebGL2 not supported, falling back to CPU renderer.');
      return false;
    }
    
    const vsSource = `#version 300 es
      in vec2 position;
      out vec2 v_texCoord;
      void main() {
        v_texCoord = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `#version 300 es
      precision mediump float;

      in vec2 v_texCoord;
      out vec4 outColor;

      uniform sampler2D u_image;
      uniform bool u_hasChromaKey;
      uniform vec3 u_chromaKeyColor;
      uniform float u_chromaKeyTolerance;
      uniform float u_chromaKeyFeather;

      uniform bool u_hasHsl;
      uniform vec3 u_hslShift;

      uniform bool u_hasLut;
      uniform sampler3D u_lutTexture;

      uniform bool u_hasLgg;
      uniform vec3 u_lift;
      uniform vec3 u_gamma;
      uniform vec3 u_gain;

      vec3 rgb2hsl(vec3 color) {
          float maxVal = max(color.r, max(color.g, color.b));
          float minVal = min(color.r, min(color.g, color.b));
          float h = 0.0;
          float s = 0.0;
          float l = (maxVal + minVal) / 2.0;

          if (maxVal != minVal) {
              float d = maxVal - minVal;
              s = l > 0.5 ? d / (2.0 - maxVal - minVal) : d / (maxVal + minVal);
              if (maxVal == color.r) {
                  h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
              } else if (maxVal == color.g) {
                  h = (color.b - color.r) / d + 2.0;
              } else if (maxVal == color.b) {
                  h = (color.r - color.g) / d + 4.0;
              }
              h /= 6.0;
          }
          return vec3(h, s, l);
      }

      float hue2rgb(float p, float q, float t) {
          if (t < 0.0) t += 1.0;
          if (t > 1.0) t -= 1.0;
          if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
          if (t < 1.0/2.0) return q;
          if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
          return p;
      }

      vec3 hsl2rgb(vec3 hsl) {
          vec3 rgb;
          if (hsl.y == 0.0) {
              rgb = vec3(hsl.z);
          } else {
              float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
              float p = 2.0 * hsl.z - q;
              rgb.r = hue2rgb(p, q, hsl.x + 1.0/3.0);
              rgb.g = hue2rgb(p, q, hsl.x);
              rgb.b = hue2rgb(p, q, hsl.x - 1.0/3.0);
          }
          return rgb;
      }

      void main() {
          vec4 texColor = texture(u_image, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
          if (texColor.a == 0.0) {
              outColor = texColor;
              return;
          }

          vec3 color = texColor.rgb;
          float alpha = texColor.a;

          if (u_hasChromaKey) {
              float dist = distance(color, u_chromaKeyColor);
              if (dist < u_chromaKeyTolerance) {
                  alpha = 0.0;
              } else if (dist < u_chromaKeyTolerance + u_chromaKeyFeather) {
                  float ratio = (dist - u_chromaKeyTolerance) / u_chromaKeyFeather;
                  alpha = min(alpha, ratio);
              }
              if (alpha == 0.0) {
                  outColor = vec4(0.0);
                  return;
              }
          }

          if (u_hasHsl) {
              vec3 hsl = rgb2hsl(color);
              hsl.x = mod(hsl.x * 360.0 + u_hslShift.x + 360.0, 360.0) / 360.0;
              hsl.y = clamp(hsl.y + u_hslShift.y / 100.0, 0.0, 1.0);
              hsl.z = clamp(hsl.z + u_hslShift.z / 100.0, 0.0, 1.0);
              color = hsl2rgb(hsl);
          }

          if (u_hasLut) {
              vec3 lutInput = clamp(color, 0.0, 1.0);
              color = texture(u_lutTexture, lutInput).rgb;
          }

          if (u_hasLgg) {
              color = color + (u_lift / 100.0) * (1.0 - color);
              
              vec3 mid = sin(color * 3.14159265) * (u_gamma / 100.0);
              color = clamp(color + mid, 0.0, 1.0);

              color = color * (1.0 + u_gain / 100.0);
          }

          outColor = vec4(clamp(color, 0.0, 1.0), alpha);
      }
    `;

    const vs = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return false;

    this.program = this.gl.createProgram()!;
    this.gl.attachShader(this.program, vs);
    this.gl.attachShader(this.program, fs);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error('WebGL program link error:', this.gl.getProgramInfoLog(this.program));
      return false;
    }

    const positionAttributeLocation = this.gl.getAttribLocation(this.program, 'position');
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]), this.gl.STATIC_DRAW);

    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    this.lutTexture = this.gl.createTexture();

    return true;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  updateLutTexture(lutEntry: Lut3D, lutText: string) {
    if (this.currentLutText === lutText || !this.gl) return;
    this.currentLutText = lutText;

    const gl = this.gl;
    const size = lutEntry.size;
    const table = lutEntry.table;

    const dataBytes = new Uint8Array(size * size * size * 4);
    let index = 0;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const entry = table[x][y][z];
          dataBytes[index * 4] = Math.round(entry[0] * 255);
          dataBytes[index * 4 + 1] = Math.round(entry[1] * 255);
          dataBytes[index * 4 + 2] = Math.round(entry[2] * 255);
          dataBytes[index * 4 + 3] = 255;
          index++;
        }
      }
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      size,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      dataBytes
    );
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  }

  process(
    source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | ImageBitmap,
    options: {
      chromaKey?: { enabled: boolean; color: string; tolerance: number; feather: number };
      hslAdjustments?: { hue: number; saturation: number; lightness: number };
      lutEntry?: Lut3D | null;
      lutText?: string | null;
      colorCorrection?: {
        lift?: { r: number; g: number; b: number };
        gamma?: { r: number; g: number; b: number };
        gain?: { r: number; g: number; b: number };
      };
    },
    destCtx: CanvasRenderingContext2D
  ): boolean {
    if (!this.init()) return false;
    const gl = this.gl!;
    const program = this.program!;

    const width = (source as any).width || (source as any).videoWidth || 640;
    const height = (source as any).height || (source as any).videoHeight || 360;

    if (this.canvas!.width !== width || this.canvas!.height !== height) {
      this.canvas!.width = width;
      this.canvas!.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    // Some browsers have texture upload issues for Video if not bound correctly
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (e) {
      console.warn("Failed WebGL texImage2D upload:", e);
      return false;
    }

    const uImageLoc = gl.getUniformLocation(program, 'u_image');
    gl.uniform1i(uImageLoc, 0);

    const hasChromaKey = !!(options.chromaKey && options.chromaKey.enabled);
    gl.uniform1i(gl.getUniformLocation(program, 'u_hasChromaKey'), hasChromaKey ? 1 : 0);
    if (hasChromaKey) {
      const keyColor = options.chromaKey!.color || '#00ff00';
      const r = parseInt(keyColor.slice(1, 3), 16) / 255;
      const g = parseInt(keyColor.slice(3, 5), 16) / 255;
      const b = parseInt(keyColor.slice(5, 7), 16) / 255;
      gl.uniform3f(gl.getUniformLocation(program, 'u_chromaKeyColor'), r, g, b);
      gl.uniform1f(gl.getUniformLocation(program, 'u_chromaKeyTolerance'), (options.chromaKey!.tolerance || 30) / 255);
      gl.uniform1f(gl.getUniformLocation(program, 'u_chromaKeyFeather'), (options.chromaKey!.feather || 10) / 255);
    }

    const hasHsl = !!(options.hslAdjustments && (options.hslAdjustments.hue !== 0 || options.hslAdjustments.saturation !== 0 || options.hslAdjustments.lightness !== 0));
    gl.uniform1i(gl.getUniformLocation(program, 'u_hasHsl'), hasHsl ? 1 : 0);
    if (hasHsl) {
      gl.uniform3f(
        gl.getUniformLocation(program, 'u_hslShift'),
        options.hslAdjustments!.hue || 0,
        options.hslAdjustments!.saturation || 0,
        options.hslAdjustments!.lightness || 0
      );
    }

    const hasLut = !!options.lutEntry;
    gl.uniform1i(gl.getUniformLocation(program, 'u_hasLut'), hasLut ? 1 : 0);
    if (hasLut && options.lutText) {
      this.updateLutTexture(options.lutEntry!, options.lutText);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_lutTexture'), 1);
    }

    const cc = options.colorCorrection;
    const lift = cc?.lift || { r: 0, g: 0, b: 0 };
    const gamma = cc?.gamma || { r: 0, g: 0, b: 0 };
    const gain = cc?.gain || { r: 0, g: 0, b: 0 };
    const hasLgg = lift.r !== 0 || lift.g !== 0 || lift.b !== 0 ||
                   gamma.r !== 0 || gamma.g !== 0 || gamma.b !== 0 ||
                     gain.r !== 0 || gain.g !== 0 || gain.b !== 0;
    gl.uniform1i(gl.getUniformLocation(program, 'u_hasLgg'), hasLgg ? 1 : 0);
    if (hasLgg) {
      gl.uniform3f(gl.getUniformLocation(program, 'u_lift'), lift.r, lift.g, lift.b);
      gl.uniform3f(gl.getUniformLocation(program, 'u_gamma'), gamma.r, gamma.g, gamma.b);
      gl.uniform3f(gl.getUniformLocation(program, 'u_gain'), gain.r, gain.g, gain.b);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    destCtx.clearRect(0, 0, width, height);
    destCtx.drawImage(this.canvas!, 0, 0);

    return true;
  }
}

export const webglPipeline = new WebGLPipeline();
