import type { WatermarkRegionPx } from './types';

export class WebGLWatermarkEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  
  private translucentProgram: WebGLProgram;
  private harmonicProgram: WebGLProgram;
  private copyProgram: WebGLProgram;
  
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  
  private sourceTexture: WebGLTexture;
  private fboA: WebGLFramebuffer;
  private texA: WebGLTexture;
  private fboB: WebGLFramebuffer;
  private texB: WebGLTexture;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    
    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // ── 1. Translucent Mode Shader (Reverse Alpha) ──
    const fsTranslucent = `
      precision highp float;
      uniform sampler2D u_frame;
      uniform vec4 u_rect;
      uniform float u_alpha;
      uniform vec3 u_pattern;
      varying vec2 v_texCoord;

      void main() {
        vec4 color = texture2D(u_frame, v_texCoord);
        bool insideX = v_texCoord.x >= u_rect.x && v_texCoord.x <= u_rect.x + u_rect.z;
        bool insideY = v_texCoord.y >= u_rect.y && v_texCoord.y <= u_rect.y + u_rect.w;
        
        if (!insideX || !insideY) {
            gl_FragColor = color;
            return;
        }

        // Apply reverse alpha blending mathematically to the region
        float maskAlpha = clamp(u_alpha, 0.0, 0.95);
        vec3 originalRGB = (color.rgb - maskAlpha * u_pattern) / (1.0 - maskAlpha);
        gl_FragColor = vec4(clamp(originalRGB, 0.0, 1.0), color.a);
      }
    `;

    // ── 2. Opaque Mode Shader (Exemplar Patch Synthesis & Tight Masking) ──
    const fsHarmonic = `
      precision highp float;
      uniform sampler2D u_current;
      uniform vec4 u_rect;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;

      float rand(vec2 co) {
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        vec4 current = texture2D(u_current, v_texCoord);
        
        bool insideX = v_texCoord.x >= u_rect.x && v_texCoord.x <= u_rect.x + u_rect.z;
        bool insideY = v_texCoord.y >= u_rect.y && v_texCoord.y <= u_rect.y + u_rect.w;
        
        if (!insideX || !insideY) {
            gl_FragColor = current;
            return;
        }

        // 1. Sample boundary background colors (outside u_rect)
        vec4 bgLeft  = texture2D(u_current, vec2(clamp(u_rect.x - 0.015, 0.0, 1.0), v_texCoord.y));
        vec4 bgRight = texture2D(u_current, vec2(clamp(u_rect.x + u_rect.z + 0.015, 0.0, 1.0), v_texCoord.y));
        vec4 bgTop   = texture2D(u_current, vec2(v_texCoord.x, clamp(u_rect.y + u_rect.w + 0.015, 0.0, 1.0)));
        vec4 bgBot   = texture2D(u_current, vec2(v_texCoord.x, clamp(u_rect.y - 0.015, 0.0, 1.0)));

        vec4 bgEst = (bgLeft + bgRight + bgTop + bgBot) * 0.25;

        // 2. Tight Masking: Calculate color distance from background
        float colorDist = distance(current.rgb, bgEst.rgb);

        // If pixel is background (not text), keep original wood texture!
        if (colorDist < 0.08) {
            gl_FragColor = current;
            return;
        }

        // 3. Exemplar Patch Matching: Sample clean wood texture offset from outside u_rect
        vec2 patchOffset = vec2(-u_rect.z * 1.2, 0.0);
        if (u_rect.x < 0.2) patchOffset = vec2(u_rect.z * 1.2, 0.0);

        vec2 sampleCoord = vec2(
            clamp(v_texCoord.x + patchOffset.x, 0.001, 0.999),
            clamp(v_texCoord.y + patchOffset.y, 0.001, 0.999)
        );

        vec4 exemplarColor = texture2D(u_current, sampleCoord);

        // Blend exemplar texture with structural background estimation
        vec3 blended = mix(bgEst.rgb, exemplarColor.rgb, 0.75);

        // 4. High-Frequency Micro-Texture/Grain Injection (prevents flat blur)
        float grain = (rand(v_texCoord * u_resolution) - 0.5) * 0.035;
        blended += vec3(grain);

        gl_FragColor = vec4(clamp(blended, 0.0, 1.0), current.a);
      }
    `;

    // ── 3. Copy Shader (For rendering FBO to Screen) ──
    const fsCopy = `
      precision highp float;
      uniform sampler2D u_frame;
      varying vec2 v_texCoord;
      void main() {
        gl_FragColor = texture2D(u_frame, v_texCoord);
      }
    `;

    this.translucentProgram = this.createProgram(gl, vsSource, fsTranslucent);
    this.harmonicProgram = this.createProgram(gl, vsSource, fsHarmonic);
    this.copyProgram = this.createProgram(gl, vsSource, fsCopy);

    // Geometry buffers
    const quad = new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]);
    this.positionBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.texCoordBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    // Textures & FBOs
    this.sourceTexture = this.createTexture(width, height);
    this.texA = this.createTexture(width, height);
    this.texB = this.createTexture(width, height);
    
    this.fboA = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);

    this.fboB = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texB, 0);
  }

  private createTexture(w: number, h: number) {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  }

  private setupQuad(program: WebGLProgram) {
    const gl = this.gl;
    const a_pos = gl.getAttribLocation(program, "a_position");
    const a_uv  = gl.getAttribLocation(program, "a_texCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(a_uv);
    gl.vertexAttribPointer(a_uv, 2, gl.FLOAT, false, 0, 0);
  }

  public processFrame(
    imageSource: CanvasImageSource, 
    region: WatermarkRegionPx, 
    mode: 'translucent' | 'opaque' = 'translucent',
    alpha: number = 0.6
  ) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Upload frame (flip Y so DOM video/frame matches WebGL coordinate space)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as any);

    const rect = [
      region.x / this.canvas.width,
      1.0 - (region.y + region.h) / this.canvas.height,
      region.w / this.canvas.width,
      region.h / this.canvas.height
    ];

    if (mode === 'translucent') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.translucentProgram);
      this.setupQuad(this.translucentProgram);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.uniform1i(gl.getUniformLocation(this.translucentProgram, "u_frame"), 0);
      
      gl.uniform4fv(gl.getUniformLocation(this.translucentProgram, "u_rect"), rect);
      gl.uniform1f(gl.getUniformLocation(this.translucentProgram, "u_alpha"), alpha);
      gl.uniform3f(gl.getUniformLocation(this.translucentProgram, "u_pattern"), 1.0, 1.0, 1.0);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      // Opaque Mode: Exemplar Patch Synthesis & Tight Masking Shader
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(this.harmonicProgram);
      this.setupQuad(this.harmonicProgram);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.uniform1i(gl.getUniformLocation(this.harmonicProgram, "u_current"), 0);

      gl.uniform4fv(gl.getUniformLocation(this.harmonicProgram, "u_rect"), rect);
      gl.uniform2f(gl.getUniformLocation(this.harmonicProgram, "u_resolution"), this.canvas.width, this.canvas.height);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    
    return this.canvas;
  }

  private createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
    const vShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vShader, vs);
    gl.compileShader(vShader);
    if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vShader));
    
    const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fShader, fs);
    gl.compileShader(fShader);
    if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fShader));
    
    const program = gl.createProgram()!;
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    return program;
  }
}
