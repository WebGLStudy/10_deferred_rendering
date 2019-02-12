(function(){
    'use strict';

    // 変数
    var gl, canvas;
    var prg_gbuffer, prg_lighting, prg_debug;
    
    var vao_floor, vao_box1, vao_box2, vao_full_screen, vao_debug_plane;
    var wMatrixFloor, wMatrixBox1, wMatrixBox2;

    window.addEventListener('load', function(){
        ////////////////////////////
        // 初期化
        ////////////////////////////
        
        // canvas の初期化
        canvas = document.getElementById('canvas');
        canvas.width = 512;
        canvas.height = 512;

        // WeebGLの初期化(WebGL 2.0)
        gl = canvas.getContext('webgl2');
        
        // 浮動小数点数レンダーターゲットを使う場合は有効にする
//        var ext = gl.getExtension('EXT_color_buffer_float');
//        if(ext == null){
//            alert('float texture not supported');
//            return;
//        }
        
        ////////////////////////////
        // プログラムオブジェクトの初期化
        
        // Gバッファ生成用シェーダ
        var vsSourceGbuffer = [
            '#version 300 es',
            'in vec3 position;',
            'in vec3 color;',
            'in vec3 normal;',
            
            'uniform mat4 mwMatrix;',
            'uniform mat4 mpvMatrix;',
            
            'out vec3 vColor;',
            'out vec4 vNormal;',

            'void main(void) {',
                'gl_Position = mpvMatrix * mwMatrix * vec4(position, 1.0);',
                'vColor = color;',
                'vNormal = mwMatrix * vec4(normal, 0.0);',
            '}'
        ].join('\n');

        var fsSourceGbuffer = [
            '#version 300 es',
            'precision highp float;',
            
            'in vec3 vColor;',
            'in vec4 vNormal;',
            
            'layout (location = 0) out vec4 outColor;',
            'layout (location = 1) out vec4 outNormal;',

            'void main(void) {',
                'outColor = vec4(vColor, 1.0);',
                'outNormal = vec4(normalize(vNormal.xyz), 1.0);',
            '}'
        ].join('\n');

        // 照明計算用シェーダ
        var vsSourceLighting = [
            '#version 300 es',
            'in vec3 position;',
            
            'out vec4 vPos;',

            'void main(void) {',
                'gl_Position = vec4(position, 1.0);',
                'vPos = gl_Position;',
            '}'
        ].join('\n');

        var fsSourceLighting = [
            '#version 300 es',
            'precision highp float;',
            
            'in vec4 vPos;',
            
            'uniform sampler2D sColor;',
            'uniform sampler2D sNormal;',

            'out vec4 outColor;',

            'void main(void) {',
                'vec3 light_dir = normalize(vec3(1,1,1));',
                'vec3 view_dir = normalize(vec3(0,6,20) - vec3(0,0,0));',

                'vec2 uv = vPos.xy * 0.5 + 0.5;',
                'vec4 color = texture(sColor, uv);',
                'vec3 normal = normalize(texture(sNormal, uv).xyz);',

                'float ln = max(dot(normal.xyz, light_dir), 0.0);',
                'vec3 diffuse = color.rgb * (0.2 + ln * 0.6);',

                'vec3 r = reflect(-view_dir, normal);',
                'float specular = 0.8 * pow(max(dot(r,light_dir),0.0), 30.0);',

                'outColor = vec4(diffuse.rgb + specular, 1.0);',
            '}'
        ].join('\n');

        // デバッグ用シェーダ
        var vsSourceDebug = [
            '#version 300 es',
            'in vec3 position;',
            'in vec2 uv;',
            
            'uniform mat4 mwMatrix;',
            
            'out vec2 vTexCoord;',

            'void main(void) {',
                'gl_Position = mwMatrix * vec4(position, 1.0);',
                'vTexCoord = uv;',
            '}'
        ].join('\n');

        var fsSourceDebug = [
            '#version 300 es',
            'precision highp float;',
            
            'in vec2 vTexCoord;',
            
            'uniform sampler2D image;',

            'out vec4 outColor;',

            'void main(void) {',
                'vec4 tex = texture(image, vTexCoord);',
                'outColor = vec4(tex.rgb, 1.0);',
            '}'
        ].join('\n');

        // シェーダ「プログラム」の初期化
        prg_gbuffer = create_program(vsSourceGbuffer, fsSourceGbuffer, ['mwMatrix', 'mpvMatrix']);
        prg_lighting = create_program(vsSourceLighting, fsSourceLighting, ['sColor', 'sNormal']);
        prg_debug = create_program(vsSourceDebug, fsSourceDebug, ['mwMatrix']);


        ////////////////////////////
        // フレームバッファオブジェクトの取得
        var Gbuffer = create_framebuffer(canvas.width, canvas.height);

        ////////////////////////////
        // モデルの構築
        // 床
        var vertex_data_floor = [
         // x     y     z      R    G    B   normal
          +5.0, -1.0, +5.0,   0.5, 0.5, 0.5, 0,1,0,
          +5.0, -1.0, -5.0,   0.5, 0.5, 0.5, 0,1,0,
          -5.0, -1.0, +5.0,   0.5, 0.5, 0.5, 0,1,0,
          -5.0, -1.0, -5.0,   0.5, 0.5, 0.5, 0,1,0,
        ];
        var index_data_floor = [
          0,  1,  2,   3,  2,  1,
        ];
        vao_floor = createMesh(gl, prg_gbuffer.prg, vertex_data_floor, index_data_floor);

        var vertex_data_box1 = [
         // x     y     z     R   G   B     nx   ny   nz
          -1.0, -1.0, -1.0,  1.0,  0,  0, -1.0, 0.0, 0.0,// 面0
          -1.0, -1.0, +1.0,  1.0,  0,  0, -1.0, 0.0, 0.0,
          -1.0, +1.0, -1.0,  1.0,  0,  0, -1.0, 0.0, 0.0,
          -1.0, +1.0, +1.0,  1.0,  0,  0, -1.0, 0.0, 0.0,
          -1.0, -1.0, -1.0,    0,1.0,  0,  0.0,-1.0, 0.0,// 面1
          +1.0, -1.0, -1.0,    0,1.0,  0,  0.0,-1.0, 0.0,
          -1.0, -1.0, +1.0,    0,1.0,  0,  0.0,-1.0, 0.0,
          +1.0, -1.0, +1.0,    0,1.0,  0,  0.0,-1.0, 0.0,
          -1.0, -1.0, -1.0,    0,  0,1.0,  0.0, 0.0,-1.0,// 面2
          -1.0, +1.0, -1.0,    0,  0,1.0,  0.0, 0.0,-1.0,
          +1.0, -1.0, -1.0,    0,  0,1.0,  0.0, 0.0,-1.0,
          +1.0, +1.0, -1.0,    0,  0,1.0,  0.0, 0.0,-1.0,
          +1.0, -1.0, -1.0,  0.0,1.0,1.0, +1.0, 0.0, 0.0,// 面3
          +1.0, +1.0, -1.0,  0.0,1.0,1.0, +1.0, 0.0, 0.0,
          +1.0, -1.0, +1.0,  0.0,1.0,1.0, +1.0, 0.0, 0.0,
          +1.0, +1.0, +1.0,  0.0,1.0,1.0, +1.0, 0.0, 0.0,
          -1.0, +1.0, -1.0,  1.0,0.0,1.0,  0.0,+1.0, 0.0,// 面4
          -1.0, +1.0, +1.0,  1.0,0.0,1.0,  0.0,+1.0, 0.0,
          +1.0, +1.0, -1.0,  1.0,0.0,1.0,  0.0,+1.0, 0.0,
          +1.0, +1.0, +1.0,  1.0,0.0,1.0,  0.0,+1.0, 0.0,
          -1.0, -1.0, +1.0,  1.0,1.0,0.0,  0.0, 0.0,+1.0,// 面5
          +1.0, -1.0, +1.0,  1.0,1.0,0.0,  0.0, 0.0,+1.0,
          -1.0, +1.0, +1.0,  1.0,1.0,0.0,  0.0, 0.0,+1.0,
          +1.0, +1.0, +1.0,  1.0,1.0,0.0,  0.0, 0.0,+1.0,
        ];
        var index_data_box1 = [
          0+0,  0+1,  0+2,   0+3,  0+2,  0+1, // 面0
          4+0,  4+1,  4+2,   4+3,  4+2,  4+1, // 面1
          8+0,  8+1,  8+2,   8+3,  8+2,  8+1, // 面2
         12+0, 12+1, 12+2,  12+3, 12+2, 12+1, // 面3
         16+0, 16+1, 16+2,  16+3, 16+2, 16+1, // 面4
         20+0, 20+1, 20+2,  20+3, 20+2, 20+1, // 面5
        ];
        vao_box1 = createMesh(gl, prg_gbuffer.prg, vertex_data_box1, index_data_box1);
        
        var l = 1.0 / Math.sqrt(3.0);
        var vertex_data_box2 = [
         // x     y     z     R    G    B   nx  ny  nz
          -1.0, -1.0, -1.0,  0.0, 0.0, 0.0, -l, -l, -l,
          +1.0, -1.0, -1.0,  1.0, 0.0, 0.0, +l, -l, -l,
          -1.0, +1.0, -1.0,  0.0, 1.0, 0.0, -l, +l, -l,
          -1.0, -1.0, +1.0,  0.0, 0.0, 1.0, -l, -l, +l,
          -1.0, +1.0, +1.0,  0.0, 1.0, 1.0, -l, +l, +l,
          +1.0, -1.0, +1.0,  1.0, 0.0, 1.0, +l, -l, +l,
          +1.0, +1.0, -1.0,  1.0, 1.0, 0.0, +l, +l, -l,
          +1.0, +1.0, +1.0,  1.0, 1.0, 1.0, +l, +l, +l,
        ];   
        var index_data_box2 = [
            3,4,0,2,0,4, // 面0
            5,3,1,0,1,3, // 面1
            2,6,0,1,0,6, // 面2
            7,5,6,1,6,5, // 面3
            4,7,2,6,2,7, // 面4
            3,5,4,7,4,5, // 面5
        ];
        vao_box2 = createMesh(gl, prg_gbuffer.prg, vertex_data_box2, index_data_box2);

        vao_full_screen = createPlane(gl, prg_lighting.prg);
        vao_debug_plane = createDebugPlane(gl, prg_debug.prg);// デバッグ用
        
        ////////////////////////////
        // 各種行列の事前計算
        var mat = new matIV();// 行列のシステムのオブジェクト

        // シーンの射影行列の生成
        var pMatrix   = mat.identity(mat.create());
        mat.perspective(40, canvas.width / canvas.height, 0.01, 40.0, pMatrix);

        // シーンの情報の設定
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        ////////////////////////////
        // フレームの更新
        ////////////////////////////
        var lastTime = null;
        var angle = 0.0;// 物体を動かす角度

        window.requestAnimationFrame(update);
        
        function update(timestamp){
            ////////////////////////////
            // 動かす
            ////////////////////////////
            // 更新間隔の取得
            var elapsedTime = lastTime ? timestamp - lastTime : 0;
            lastTime = timestamp;

            // カメラを回すパラメータ
            angle += 0.0001 * elapsedTime;
            if(1.0 < angle) angle -= 1.0;

            // ワールド行列の生成
            wMatrixFloor = mat.identity(mat.create());
            wMatrixBox1   = mat.identity(mat.create());
            wMatrixBox2   = mat.identity(mat.create());
            var mtmp1 = mat.create();
            var mtmp2 = mat.create();
            mat.translate(mat.identity(mat.create()), [-2.0, 0.7, 0.0], wMatrixBox1); // 左に移動
            mat.translate(mat.identity(mat.create()), [+2.0, 0.7, 0.0], wMatrixBox2); // 右に移動
            mat.rotate(wMatrixBox1, -0.25 * Math.PI, [0.7, 0.0, -0.7], mtmp1);// 斜めに傾ける
            mat.rotate(wMatrixBox2, -0.25 * Math.PI, [0.7, 0.0, -0.7], mtmp2);// 斜めに傾ける
            mat.rotate(mtmp1, 2.0 * Math.PI* angle, [0.577, 0.577, 0.577], wMatrixBox1);// 回転
            mat.rotate(mtmp2, 2.0 * Math.PI* angle, [0.577, 0.577, 0.577], wMatrixBox2);// 回転

            // ビュー行列の生成
            var camera_pos = [0.0, 6.0, 20.0];
            var look_at = [0.0, 0.0, 0.0];
            var up = [0.0, 1.0, 0.0];
            var vMatrix = mat.create();
            mat.lookAt(camera_pos, look_at, up, vMatrix);

            // ビュー射影行列の生成
            var pvMatrix = mat.create();
            mat.multiply (pMatrix, vMatrix, pvMatrix);
            
            ////////////////////////////
            // 描画
            ////////////////////////////
            
            ////////////////////////////
            // Gバッファへの描画
            gl.bindFramebuffer(gl.FRAMEBUFFER, Gbuffer.f);
            gl.viewport(0.0, 0.0, canvas.width, canvas.height);
            
            // 画面クリア
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clearDepth(1.0);// 初期設定する深度値(一番奥の深度)
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            // オブジェクト描画
            gl.useProgram(prg_gbuffer.prg);
            draw_scene(prg_gbuffer, pvMatrix);

            ////////////////////////////
            // 照明計算
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0.0, 0.0, canvas.width, canvas.height);
            gl.disable(gl.DEPTH_TEST);

            gl.useProgram(prg_lighting.prg);
            // 色テクスチャの設定
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, Gbuffer.t[0]);
            gl.uniform1i(prg_lighting.loc[0], 0);
            // 法線マップの設定
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, Gbuffer.t[1]);
            gl.uniform1i(prg_lighting.loc[1], 1);
            
            gl.bindVertexArray(vao_full_screen);
            gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_BYTE, 0);
            
            ////////////////////////////
            // デバッグ描画
            gl.useProgram(prg_debug.prg);
            gl.bindVertexArray(vao_debug_plane);
            gl.activeTexture(gl.TEXTURE0);
            var a_debug_tex = [Gbuffer.t[0], Gbuffer.t[1]];
            for(var i = 0; i < 2; i++){
                var m = mat.identity(mat.create());
                mat.translate(mat.identity(mat.create()), [i * 0.5, 0.0, 0.0], m);
                gl.uniformMatrix4fv(prg_debug.loc[0], false, m);
                gl.bindTexture(gl.TEXTURE_2D, a_debug_tex[i]);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0);
            }

            ////////////////////////////
            // 次のフレームへの処理
            ////////////////////////////
            gl.enable(gl.DEPTH_TEST);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.useProgram(null);
            gl.flush();
            window.requestAnimationFrame(update);
        }
        
    }, false);

    // モデル描画
    function draw_scene(program, pvMatrix)
    {
        gl.uniformMatrix4fv(program.loc[1], false, pvMatrix);
        
        // 箱
        gl.uniformMatrix4fv(program.loc[0], false, wMatrixBox1);
        gl.bindVertexArray(vao_box1);
        gl.drawElements(gl.TRIANGLES, 6*6, gl.UNSIGNED_BYTE, 0);

        gl.uniformMatrix4fv(program.loc[0], false, wMatrixBox2);
        gl.bindVertexArray(vao_box2);
        gl.drawElements(gl.TRIANGLES, 6*6, gl.UNSIGNED_BYTE, 0);

        // 床
        gl.uniformMatrix4fv(program.loc[0], false, wMatrixFloor);
        gl.bindVertexArray(vao_floor);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0);
    }

    // シェーダの読み込み
    function load_shader(src, type)
    {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
            alert(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    // プログラムオブジェクトの生成
    function create_program(vsSource, fsSource, uniform_names)
    {
        var prg = gl.createProgram();
        gl.attachShader(prg, load_shader(vsSource, gl.VERTEX_SHADER));
        gl.attachShader(prg, load_shader(fsSource, gl.FRAGMENT_SHADER));
        gl.linkProgram(prg);
        if(!gl.getProgramParameter(prg, gl.LINK_STATUS)){
            alert(gl.getProgramInfoLog(prg));
        }

        var uniLocations = [];
        uniform_names.forEach(function(value){
            uniLocations.push(gl.getUniformLocation(prg, value));
        });
        
        return {prg : prg, loc : uniLocations};
    }

    // フレームバッファの生成(RGBA+RGBA)
    function create_framebuffer(width, height){
        // フレームバッファ
        var frameBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

        // 使うバッファを宣言
        var bufferList = [
            gl.COLOR_ATTACHMENT0,
            gl.COLOR_ATTACHMENT1
        ];
        gl.drawBuffers(bufferList)
        
        // 深度バッファ
        var depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
        
        // 書き出し用テクスチャ
        var textures = [];
        for(var i = 0; i < 2; i++){
            textures[i] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, textures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
//            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );// floatだとバイリニア不可
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0+i, gl.TEXTURE_2D, textures[i], 0);
        }
        
        // 各種オブジェクトを解除
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        // フレームバッファとテクスチャを返す
        return {f : frameBuffer, t : textures};
    }
    
    // 箱モデルの生成
    function createMesh(gl, program, vertex_data, index_data) {
        var vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // 頂点バッファ
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertex_data), gl.STATIC_DRAW);

        var posAttr = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(posAttr);
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 4*9, 4*0);

        var colAttr = gl.getAttribLocation(program, 'color');
        gl.enableVertexAttribArray(colAttr);
        gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 4*9, 4*3);

        var nrmAttr = gl.getAttribLocation(program, 'normal');
        gl.enableVertexAttribArray(nrmAttr);
        gl.vertexAttribPointer(nrmAttr, 3, gl.FLOAT, false, 4*9, 4*6);

        // インデックスバッファ
        var indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(index_data), gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return vao;
    };
    
    // 全画面描画用モデルの生成
    function createPlane(gl, program) {
        var vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        var vertex_data = new Float32Array([
         // x    y     z
          -1.0,-1.0, -1.0,
          +3.0,-1.0, -1.0,
          -1.0,+3.0, -1.0,
        ]);

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STATIC_DRAW);

        var posAttr = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(posAttr);
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 4*3, 0);

        var index_data = new Uint8Array([
          0,  1,  2,
        ]);
        var indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_data, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return vao;
    };
    
    // デバッグ用平面モデルの生成
    function createDebugPlane(gl, program) {
        var vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        var vertex_data = new Float32Array([
         // x    y     z      u    v 
          -0.5, 0.5, -1.0,   1.0, 0.0,
          -0.5, 1.0, -1.0,   1.0, 1.0,
          -1.0, 0.5, -1.0,   0.0, 0.0,
          -1.0, 1.0, -1.0,   0.0, 1.0,
        ]);

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STATIC_DRAW);

        var posAttr = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(posAttr);
        gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 4*5, 0);

        var colAttr = gl.getAttribLocation(program, 'uv');
        gl.enableVertexAttribArray(colAttr);
        gl.vertexAttribPointer(colAttr, 2, gl.FLOAT, false, 4*5, 4*3);

        var index_data = new Uint8Array([
          0,  1,  2,   3,  2,  1,
        ]);
        var indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_data, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return vao;
    };



})();
