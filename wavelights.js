    import * as THREE from "https://esm.sh/three";
    import GUI from "https://esm.sh/lil-gui";
    import Stats from "https://esm.sh/three/addons/libs/stats.module.js";

    // --- Configuration and Settings ---
    const settings = {
        dpr: 1.0,                  // Device Pixel Ratio (default 1 as requested)   1.0
    };
    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);    
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(settings.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // --- Shader Material ---
    const uniforms = {
        iTime: { value: 0.0 },
        iResolution: { value: new THREE.Vector3() },
        uRenderPosOffset: { value: 0.0 },
        //Color
        uColor_a: { value: new THREE.Vector3(0.5, 0.5, 0.5) },  //Quilez palette - Base color(brightness/offset)
        uColor_b: { value: new THREE.Vector3(0.5, 0.5, 0.5) },  //Quilez palette - Color amplitude (contrast/saturation)
        uColorType: {value: 1},                                 //Selector for color palettes
        uBaseColorFactor: {value: 0.65},                        //multiplier for Quilez palette - Base color(brightness/offset)
        uColorAmplitudeFactor: {value: 0.65},                   //multiplier for Quilez palette - Color amplitude (contrast/saturation)
        uColorCycleSpeed: {value: 0.0},                         //Quilez palette - how fast to fade between colors
        uColorRange_c: {value: 0.4},                            //Quilez palette - range of colors to be shown at once (0.5 = fade between 2 colors)
        uColorRange_offset: {value: 0.34},                      //Quilez palette - Offset for color-range - 
                                                                //useful for selecting colors when only one ore two colors are shown
        //Rendering
        uStepBase: { value: 0.0023 },                           // Base step size for raymarching    
        uRenderSteps: { value: 80 },                            //Render-loop cycles
        uRenderPosFactor: { value: 0.85 },                      //Test multiplier for position (Render-Distance multiplier)
        uTotalDistOffset: { value: 2.85 },                      //Start position offset value for raymarching
        uZPos: { value: -5.03},                                 //manipulation of z-pos --> distance to wave
        uYPos: { value: 0.0},                                  //manipulation of y-pos --> view angle
        //Wave Animation
        uZDepth: { value: 4.3 },
        uWaveSpeed: { value: 0.12 },                            // Global speed-factor of the wave
        uWZFactor: { value: 0.0 },                              //'Speed'-Multiplier for z-wave
        uNoiseWaveXFactor: { value: -0.511 },                   // X Frequency of the third wave (Diagonal)
        uNoiseWaveZFactor: { value: 0.322 },                    // Z Frequency of the third wave (Diagonal) 
        //Wave Form
        uWaveHeight: { value: 1.96 },                           // Global Multiplier for wave amplitude
        uWaveZFreq: { value: 0.91 },                            // Frequency of the Z-wave
        uWaveZAmp: { value: -0.162 },                           // Amplitude of the second wave (Z-axis) 
        uNoiseWaveXFreq: { value: 0.4 },                        // Amplitude of the second wave (Z-axis) 
        uNoiseWaveZFreq: { value: 1.11 },                       // Amplitude of the second wave (Z-axis) 
        uNoiseWaveAmp: { value: -0.17 },                        // Amplitude of the third wave (Diagonal)

        //Light
        uBlendFactor: { value: 0.1084 },
        uBlendDivisor: { value: 40.0 },
        uGlowIntensity: { value: 0.0049 },                      // Numerator for glow calculation  
        uGlowSpread: { value: 2.2 },                            // Denominator offset for glow calculation 
    };
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Simple vertex shader for full-screen quad
    const vertexShader = `
        void main() {
            gl_Position = projectionMatrix * vec4(position, 1.0);
        }
    `;

    // Ported fragment shader (shadertoy -> three.js)
    const fragmentShader = `
        #define PI 3.14159265359
        uniform vec3 iResolution;
        uniform float iTime;
        uniform float uRenderPosOffset;
        uniform float uWaveSpeed;
        uniform float uWaveHeight;
        
        uniform float uWaveZFreq;
        uniform float uWaveZAmp;
        uniform float uWZFactor; //0.6
        uniform float uNoiseWaveXFreq;
        uniform float uNoiseWaveZFreq;
        uniform float uNoiseWaveXFactor;
        uniform float uNoiseWaveZFactor;
        uniform float uNoiseWaveAmp;

        uniform float uStepBase;
        uniform float uGlowIntensity;
        uniform float uGlowSpread;
        
        uniform float uBlendFactor; //0.15
        uniform float uBlendDivisor;
        uniform float uZPos; // -2.0
        uniform float uYPos; // -2.0
        uniform float uZDepth;
        
        uniform int uRenderSteps; //38
        uniform float uRenderPosFactor; //1.0
        uniform vec3 uColor_a;
        uniform vec3 uColor_b;
        uniform float uColorCycleSpeed;
        uniform float uColorAmplitudeFactor;
        uniform int uColorType;
        uniform float uColorRange_c;
        uniform float uColorRange_offset;
        uniform float uBaseColorFactor;
        uniform float uTotalDistOffset;

        //
        // GLSL textureless classic 3D noise "cnoise",
        // with an RSL-style periodic variant "pnoise".
        // Author:  Stefan Gustavson (stefan.gustavson@liu.se)
        // Version: 2011-10-11
        //
        // Many thanks to Ian McEwan of Ashima Arts for the
        // ideas for permutation and gradient selection.
        //
        // Copyright (c) 2011 Stefan Gustavson. All rights reserved.
        // Distributed under the MIT license. See LICENSE file.
        // https://github.com/ashima/webgl-noise
        //

        vec3 mod289(vec3 x)
        {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289(vec4 x)
        {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute(vec4 x)
        {
          return mod289(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt(vec4 r)
        {
          return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade(vec3 t) {
          return t*t*t*(t*(t*6.0-15.0)+10.0);
        }


        // Classic Perlin noise
        float cnoise(vec3 P)
        {
          vec3 Pi0 = floor(P); // Integer part for indexing
          vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
          Pi0 = mod289(Pi0);
          Pi1 = mod289(Pi1);
          vec3 Pf0 = fract(P); // Fractional part for interpolation
          vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
          vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
          vec4 iy = vec4(Pi0.yy, Pi1.yy);
          vec4 iz0 = Pi0.zzzz;
          vec4 iz1 = Pi1.zzzz;

          vec4 ixy = permute(permute(ix) + iy);
          vec4 ixy0 = permute(ixy + iz0);
          vec4 ixy1 = permute(ixy + iz1);

          vec4 gx0 = ixy0 * (1.0 / 7.0);
          vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
          gx0 = fract(gx0);
          vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
          vec4 sz0 = step(gz0, vec4(0.0));
          gx0 -= sz0 * (step(0.0, gx0) - 0.5);
          gy0 -= sz0 * (step(0.0, gy0) - 0.5);

          vec4 gx1 = ixy1 * (1.0 / 7.0);
          vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
          gx1 = fract(gx1);
          vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
          vec4 sz1 = step(gz1, vec4(0.0));
          gx1 -= sz1 * (step(0.0, gx1) - 0.5);
          gy1 -= sz1 * (step(0.0, gy1) - 0.5);

          vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
          vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
          vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
          vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
          vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
          vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
          vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
          vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

          vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
          g000 *= norm0.x;
          g010 *= norm0.y;
          g100 *= norm0.z;
          g110 *= norm0.w;
          vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
          g001 *= norm1.x;
          g011 *= norm1.y;
          g101 *= norm1.z;
          g111 *= norm1.w;

          float n000 = dot(g000, Pf0);
          float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
          float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
          float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
          float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
          float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
          float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
          float n111 = dot(g111, Pf1);

          vec3 fade_xyz = fade(Pf0);
          vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
          vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
          float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
          return 2.2 * n_xyz;
        }
        // 	<www.shadertoy.com/view/XsX3zB>
        //	by Nikita Miropolskiy

        /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
        vec3 random3(vec3 c) {
            float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
            vec3 r;
            r.z = fract(512.0*j);
            j *= .125;
            r.x = fract(512.0*j);
            j *= .125;
            r.y = fract(512.0*j);
            return r-0.5;
        }

        const float F3 =  0.3333333;
        const float G3 =  0.1666667;
        float snoise(vec3 p) {

            vec3 s = floor(p + dot(p, vec3(F3)));
            vec3 x = p - s + dot(s, vec3(G3));
             
            vec3 e = step(vec3(0.0), x - x.yzx);
            vec3 i1 = e*(1.0 - e.zxy);
            vec3 i2 = 1.0 - e.zxy*(1.0 - e);
                
            vec3 x1 = x - i1 + G3;
            vec3 x2 = x - i2 + 2.0*G3;
            vec3 x3 = x - 1.0 + 3.0*G3;
             
            vec4 w, d;
             
            w.x = dot(x, x);
            w.y = dot(x1, x1);
            w.z = dot(x2, x2);
            w.w = dot(x3, x3);
             
            w = max(0.6 - w, 0.0);
             
            d.x = dot(random3(s), x);
            d.y = dot(random3(s + i1), x1);
            d.z = dot(random3(s + i2), x2);
            d.w = dot(random3(s + 1.0), x3);
             
            w *= w;
            w *= w;
            d *= w;
             
            return dot(d, vec4(52.0));
        }

        float snoiseFractal(vec3 m) {
            return   0.5333333* snoise(m)
                        +0.2666667* snoise(2.0*m)
                        +0.1333333* snoise(4.0*m)
                        +0.0666667* snoise(8.0*m);
        }        
        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        vec3 colorPalette(float totalDistance){
            // Generate procedural color palette
           
            vec2 pixPos = gl_FragCoord.xy/iResolution.xy; //using pixel position for blending from left to right screen
           ///Inigo Quilez’s cosine formula
           // a: Base color (brightness/offset) a = vec3(0.5, 0.5, 0.5);
           // b: Color amplitude (contrast/saturation) b = vec3(0.5, 0.5, 0.5);
           // c: Frequency (Visible colorrange - how many colors are visible: 0.5 ~ 2 colors)
           // e: Phase (color shifts)                
            vec3 c = vec3(1.0, 1.0, 1.0) * uColorRange_c;
            vec3 e = vec3(0.0, 0.33, 0.67);
            
            // animate
            vec3 paletteColor = vec3(0.0,0.0,0.0);
            switch (uColorType){
                case 0:
                    //linear fadeing from blue to green along x 
                    paletteColor = vec3(0.0, pixPos); 
                    break;
                case 1:
                    //cycling through Inigo Quilez’s cosine formula with current pixel pos as factor
                    pixPos.x += uColorCycleSpeed*iTime; //determins how fast colors cycle
                    paletteColor = uColor_a*uBaseColorFactor + uColor_b*uColorAmplitudeFactor * cos(2.0 * 3.14159 * (c * pixPos.x + uColorRange_offset + e));
                    break;
                case 2:
                    //cycling through Inigo Quilez’s cosine formula with total distance as factor
                    //paletteColor = a + b * cos(2.0 * 3.14159 * (c * totalDistance + e));
                    paletteColor = uColor_a*uBaseColorFactor + uColor_b*uColorAmplitudeFactor * cos(2.0 * 3.14159 * (c * totalDistance + e));
                    break;
            }  
            return paletteColor;
        }

        float waveMap(vec3 currentPos) {
            float wTime = iTime * uWaveSpeed;
            float z_axis_wave = sin(currentPos.z * uWaveZFreq - wTime * uWZFactor) * uWaveZAmp;
            float noise_wave = (snoiseFractal(vec3((currentPos.x * uNoiseWaveXFreq) + (wTime * uNoiseWaveXFactor), currentPos.z * uNoiseWaveZFreq, wTime * uNoiseWaveZFactor)) * uNoiseWaveAmp);
            float waveHeight = (z_axis_wave + noise_wave) * uWaveHeight;
            float distToWave = abs(currentPos.y - waveHeight);
            return distToWave;
        }

        void main() {

            // Normalize pixel coordinates (from -1 to 1, accounting for aspect ratio)
            vec2 fragCoord = gl_FragCoord.xy;
            vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
            // Set up camera ray direction
            vec3 rayDir = normalize(vec3(uv, uZPos));
            // Initialize variables for raymarching
            vec4 finalColor = vec4(0.0);
            float totalDistance = uTotalDistOffset;
            vec3 currentPos = vec3(0.0);
            float distToWave = 0.0;
            float stepSize = 0.0;
            float glowIntensity =  0.0;
            float blendFactor = 0.0;
            vec3 paletteColor = vec3(0.0);
            // Main raymarching and accumulation loop
            for (int i = 0; i < uRenderSteps; i+= 1) {
                // Calculate current position along the ray
                currentPos = uRenderPosFactor*rayDir * totalDistance + (uRenderPosOffset * vec3(uv, uZPos));
                currentPos.y += uYPos;            
                distToWave = waveMap(currentPos);
                // Calculate distance step
                stepSize = max(0.0, distToWave) + uStepBase;
                totalDistance += stepSize;

                // --- Volumetric accumulation and shading ---               
                blendFactor = uBlendFactor / (distToWave * distToWave * uBlendDivisor + 0.01);

                // Calculate glow intensity
                glowIntensity = uGlowIntensity / (uGlowSpread + stepSize);
 
                // Generate procedural color palette
                paletteColor = colorPalette(totalDistance);
                //////////////////////////////////////////////////
                // Accumulate final results into the output color
                finalColor.rgb += glowIntensity * blendFactor* paletteColor;
                if (totalDistance > uZDepth) break;
                if (distToWave > 0.9) break;
            }
             // Output final color with full opacity
            gl_FragColor = vec4(finalColor.rgb, 1.0);
        }
    `;
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: uniforms,
    });

    // Full screen plane
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // --- Resize Handler ---
    function updateResolution() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        if (uniforms.u_resolution !== undefined) {
            uniforms.u_resolution.value.x = window.innerWidth * window.devicePixelRatio
            uniforms.u_resolution.value.y = window.innerHeight * window.devicePixelRatio
        }
        
        // Update iResolution to match canvas physical pixels
        const pixelRatio = renderer.getPixelRatio();
        uniforms.iResolution.value.set(width * pixelRatio, height * pixelRatio, 1);
    }

    window.addEventListener('resize', updateResolution);
    updateResolution(); // Initial call
    
//--------------------------------GUI------------------------------------------------------------------------    
    let format = function date2str(x, y) {
        var z = {
            M: x.getMonth() + 1,
            d: x.getDate(),
            h: x.getHours(),
            m: x.getMinutes(),
            s: x.getSeconds()
        };
        y = y.replace(/(M+|d+|h+|m+|s+)/g, function(v) {
            return ((v.length > 1 ? "0" : "") + z[v.slice(-1)]).slice(-2)
        });

        return y.replace(/(y+)/g, function(v) {
            return x.getFullYear().toString().slice(-v.length)
        });
    }
    let exportGUIParams = function() {
        let preset = gui.save();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], {
        type: "text/plain"
        }));
        const fileName = format(new Date(), 'yyMMdd_hhmm') + ".gui";
        a.setAttribute("download", fileName);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    let importGUIParams = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gui'; // Restrict to text files

        input.onchange = (event) => {
            const file = event.target.files[0];
            const reader = new FileReader();
            
            reader.onload = (e) => {
                let json = JSON.parse(e.target.result);
                gui.load(json);
             };
            
            reader.readAsText(file);
        };

        input.click(); // Programmatically open the dialog
    }
    
    // --- GUI Setup (lil-gui) ---
    const gui = new GUI({ title: 'Scene Settings' });
    const colorPaletteOptions = {
        'linear fade  blue/green': 0,
        'Quilez platte by pixel pos': 1,
        'Quilez platte by distance': 2,
    }
    const colorFold = gui.addFolder("Color")
    colorFold.add(uniforms.uColorType, "value", colorPaletteOptions).name('Color palette').onChange((val) => {
      uniforms.uColorType.value = val;
      if([1,2].includes(val)){QuilezPalette.show();
        if(val==2){ColorCycleSpeed.hide();}
        else{ColorCycleSpeed.show();}
      }
      else QuilezPalette.hide();
    })
    const QuilezPalette = colorFold.addFolder("QuilezPalette")
    const QuilezPaletteBase = QuilezPalette.addFolder("Basecolor (brightness/offset)")
    QuilezPaletteBase.add(uniforms.uBaseColorFactor, "value", 0.0, 10.0, 0.05).name('Factor').onChange((val) => {
      uniforms.uBaseColorFactor.value = val;
    })
    QuilezPaletteBase.add(uniforms.uColor_a.value, "x", 0.0, 2.0, 0.05).name('ax').onChange((val) => {
      uniforms.uColor_a.value.x = val;
    })
    QuilezPaletteBase.add(uniforms.uColor_a.value, "y", 0.0, 2.0, 0.05).name('ay').onChange((val) => {
      uniforms.uColor_a.value.y = val;
    })
    QuilezPaletteBase.add(uniforms.uColor_a.value, "z", 0.0, 2.0, 0.05).name('az').onChange((val) => {
      uniforms.uColor_a.value.z = val;
    })
    const QuilezPaletteAmp = QuilezPalette.addFolder("Color amplitude (contrast/saturation)")
    QuilezPaletteAmp.add(uniforms.uColorAmplitudeFactor, "value", 0.0, 10.0, 0.05).name('Factor').onChange((val) => {
      uniforms.uColorAmplitudeFactor.value = val;
    })
    QuilezPaletteAmp.add(uniforms.uColor_b.value, "x", 0.0, 2.0, 0.05).name('bx').onChange((val) => {
      uniforms.uColor_b.value.x = val;
    })
    QuilezPaletteAmp.add(uniforms.uColor_b.value, "y", 0.0, 2.0, 0.05).name('by').onChange((val) => {
      uniforms.uColor_b.value.y = val;
    })
    QuilezPaletteAmp.add(uniforms.uColor_b.value, "z", 0.0, 2.0, 0.05).name('bz').onChange((val) => {
      uniforms.uColor_b.value.z = val;
    })
    const ColorCycleSpeed = QuilezPalette.add(uniforms.uColorCycleSpeed, "value", -1.0, 1.0, 0.05).name('Cycle speed').onChange((val) => {
      uniforms.uColorCycleSpeed.value = val;
    })
    const ColorFactor_c = QuilezPalette.add(uniforms.uColorRange_c, "value", 0.0, 2.0, 0.05).name('Color range (c)').onChange((val) => {
      uniforms.uColorRange_c.value = val;
    })
    const ColorRange_offset = QuilezPalette.add(uniforms.uColorRange_offset, "value", 0, 1.0, 0.01).name('Color range offset').onChange((val) => {
      uniforms.uColorRange_offset.value = val;
    })
    if([1,2].includes(uniforms.uColorType.value)){QuilezPalette.show();
        if(uniforms.uColorType.value==2){
          ColorCycleSpeed.hide();
          ColorRange_offset.hide();
        }
        else{
          ColorCycleSpeed.show();
          ColorRange_offset.show();
        }
    }
    else QuilezPalette.hide();
    colorFold.close();
    
    
    const fRender = gui.addFolder('Rendering');
    fRender.add(settings, 'dpr', 0.5, 2.0, 0.1).name('Device Pixel Ratio').onChange(val => {
        renderer.setPixelRatio(val);
        updateResolution();
    });
    fRender.add(uniforms.uRenderPosOffset, 'value', -10.0, 10.0, 0.01).name('RenderPos offset').onChange(v => uniforms.uRenderPosOffset.value = v);
    fRender.add(uniforms.uStepBase, 'value', -0.01, 0.02, 0.0001).name('Base Step-Size').onChange(v => uniforms.uStepBase.value = v);
    fRender.add(uniforms.uRenderSteps, 'value', 5, 200, 1).name('Render-Steps').onChange(v => uniforms.uRenderSteps.value = v);
    fRender.add(uniforms.uRenderPosFactor, 'value', 0.1, 10.0, 0.01).name('Render-Distance multiplier').onChange(v => uniforms.uRenderPosFactor.value = v);
    fRender.add(uniforms.uTotalDistOffset, 'value', -1.0, 10.0, 0.05).name('Start-position offset').onChange(v => uniforms.uTotalDistOffset.value = v);
    fRender.add(uniforms.uYPos, 'value', -15.0, 15.0, 0.01).name('Y-Positon').onChange(v => uniforms.uYPos.value = v);
    fRender.add(uniforms.uZPos, 'value', -15.0, 15.0, 0.01).name('Z-Positon').onChange(v => uniforms.uZPos.value = v);
    fRender.add(uniforms.uZDepth,"value", 0.0, 20.0, 0.05).name('Z-Depth').onChange(v => uniforms.uZDepth.value = v);
    fRender.close();
    
    const fAnim = gui.addFolder('Animation');
    fAnim.add(uniforms.uWaveSpeed, 'value', 0.0, 3.0, 0.01).name('Wave Speed').onChange(v => uniforms.uWaveSpeed.value = v);
    fAnim.add(uniforms.uWZFactor, 'value', -2.0, 2.0, 0.001).name('Z-Wave Speed-Factor').onChange(v => uniforms.uWZFactor.value = v);
    fAnim.add(uniforms.uNoiseWaveXFactor, 'value', -2.0, 2.0, 0.001).name('Noise-Wave X-Speed-Factor').onChange(v => uniforms.uNoiseWaveXFactor.value = v);
    fAnim.add(uniforms.uNoiseWaveZFactor, 'value', -1.5, 1.5, 0.001).name('Noise-Wave Z-Speed-Factor').onChange(v => uniforms.uNoiseWaveZFactor.value = v);
    fAnim.close();
    
    const fWave = gui.addFolder('Wave Form');
    fWave.add(uniforms.uWaveHeight, 'value', 0.0, 15.0, 0.01).name('Global Height Multiplier').onChange(v => uniforms.uWaveHeight.value = v);
        
    const fWave2 = fWave.addFolder('Wave 2 (Z-Axis)');
    fWave2.add(uniforms.uWaveZFreq, 'value', 0.0, 5.0, 0.01).name('Frequency').onChange(v => uniforms.uWaveZFreq.value = v);
    fWave2.add(uniforms.uWaveZAmp, 'value', -0.5, 0.5, 0.001).name('Amplitude').onChange(v => uniforms.uWaveZAmp.value = v);
    
    const fWaveNoise = fWave.addFolder('Noise-Wave (Perlin noise)');
    fWaveNoise.add(uniforms.uNoiseWaveXFreq, 'value', 0.0, 5.0, 0.01).name('X-Frequency').onChange(v => uniforms.uNoiseWaveXFreq.value = v);
    fWaveNoise.add(uniforms.uNoiseWaveZFreq, 'value', 0.0, 5.0, 0.01).name('Z-Frequency').onChange(v => uniforms.uNoiseWaveZFreq.value = v);
    fWaveNoise.add(uniforms.uNoiseWaveAmp, 'value', -0.5, 0.5, 0.001).name('Amplitude').onChange(v => uniforms.uNoiseWaveAmp.value = v);
    fWave.close();
    
    const fLight = gui.addFolder('Light');
    //fLight.add(uniforms.uNoiseAmount, 'value', 0.0, 0.02, 0.001).name('Noise Amount').onChange(v => uniforms.uNoiseAmount.value = v);
    fLight.add(uniforms.uBlendFactor, 'value', 0.0, 2.0, 0.0001).name('blendFactor').onChange(v => uniforms.uBlendFactor.value = v);
    fLight.add(uniforms.uBlendDivisor, 'value', 0.001, 40.0, 0.0001).name('blendDivisor').onChange(v => uniforms.uBlendDivisor.value = v);
    fLight.add(uniforms.uGlowIntensity, 'value', 0.001, 0.05, 0.0001).name('Glow Intensity').onChange(v => uniforms.uGlowIntensity.value = v);
    fLight.add(uniforms.uGlowSpread, 'value', 0.1, 10.0, 0.1).name('Glow Spread').onChange(v => uniforms.uGlowSpread.value = v);
    fLight.close();
    
    const fLoadSave  = gui.addFolder('Load & Save settings');
    fLoadSave.add({saveParams: function() { exportGUIParams() }},'saveParams');
    fLoadSave.add({loadParams: function() { importGUIParams() }},'loadParams');
    fLoadSave.close();
    gui.add({stats: function(){stats1.domElement.style.visibility=='hidden'?stats1.domElement.style.visibility='':stats1.domElement.style.visibility='hidden'; }},'stats').name('show/hide stats');
    fLoadSave.onChange((e)=>console.log(e));
    gui.close();
 
    function closeGUIFolders(folder){
        if(!folder._closed) {
            folder !=colorFold?(!colorFold._closed ? colorFold.close():""):"";
            folder !=fRender?(!fRender._closed ? fRender.close():""):"";
            folder !=fAnim?(!fAnim._closed ? fAnim.close():""):"";
            folder !=fWave?(!fWave._closed ? fWave.close():""):"";
            folder !=fLight?(!fLight._closed ? fLight.close():""):"";
            folder !=fLoadSave?(!fLoadSave._closed ? fLoadSave.close():""):"";
        }
    }
    colorFold.$title.addEventListener('click', () => {closeGUIFolders(colorFold);});
    fRender.$title.addEventListener('click', () => {closeGUIFolders(fRender);});
    fAnim.$title.addEventListener('click', () => {closeGUIFolders(fAnim);});
    fWave.$title.addEventListener('click', () => {closeGUIFolders(fWave);});
    fLight.$title.addEventListener('click', () => {closeGUIFolders(fLight);});
    fLoadSave.$title.addEventListener('click', () => {closeGUIFolders(fLoadSave);});
    
//-----------------------------------------------------------------------------------------------
    // --- Main Animation Loop ---
    const clock = new THREE.Timer();
    // Stats - show fps
    let stats1 = new Stats();
    stats1.showPanel(0); // Panel 0 = fps
    stats1.domElement.style.cssText =
      "position:absolute;top:0px;left:0px;";
    document.body.appendChild(stats1.domElement);
    stats1.domElement.style.visibility='hidden';

    function animate() {
        requestAnimationFrame(animate);
        clock.update();
        uniforms.iTime.value = clock.getElapsed();        
        renderer.render(scene, camera);
        stats1.update();
    }

    animate();
