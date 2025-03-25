#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import http from 'http';
import handler from 'serve-handler';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectName = process.argv[2] || 'recursion-app';
const projectPath = path.join(process.cwd(), projectName);

const sdkPath = path.join(__dirname, '../dist/hcs-recursion-sdk.js');
const sdkContent = fs.readFileSync(sdkPath, 'utf8');

const createProject = async () => {
  if (fs.existsSync(projectPath)) {
    console.error(`Directory ${projectName} already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(projectPath);

  const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>HCS Recursion - With Raw WASM Handling</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background-color: #000033;
      }
      canvas {
        display: block;
      }
      #overlay {
        position: absolute;
        top: 20px;
        left: 20px;
        color: #00ffff;
        font-family: Arial, sans-serif;
        font-size: 24px;
        text-shadow: 0 0 10px #00ffff;
      }
      #loading-indicator {
        position: absolute;
        top: 60px;
        left: 20px;
        color: #ffff00;
        font-family: Arial, sans-serif;
        font-size: 18px;
      }
    </style>
    <script
      data-hcs-config
      data-hcs-cdn-url="https://kiloscribe.com/api/inscription-cdn/"
      data-hcs-network="mainnet"
      data-hcs-debug="true"
      data-hcs-retry-attempts="5"
      data-hcs-retry-backoff="500"
      data-hcs-show-loading-indicator="true"
      data-hcs-loading-callback-name="setLoadingIndicator"
    ></script>
  </head>
  <body>
    <canvas id="myCanvas"></canvas>
    <div id="overlay">Basic HCS Recursion with Raw WASM Handling</div>
    <div id="loading-indicator"></div>
    <script
      data-src="hcs://1/0.0.6614307"
      data-load-order="1"
      data-script-id="threejs"
    ></script>
    <script
      data-src="hcs://1/0.0.6627067"
      data-load-order="2"
      data-script-id="animejs"
    ></script>
    <script
      data-src="hcs://1/0.0.6628687"
      data-script-id="rust-wasm"
      type="wasm"
      data-load-order="3"
    ></script>
    <script>${sdkContent}</script>
    <script>
      window.setLoadingIndicator = function (id, status) {
        const loadingIndicator = document.getElementById('loading-indicator');

        let element = document.getElementById(\`loading-status-\${id}\`);
        if (!element) {
          element = document.createElement('div');
          element.id = \`loading-status-\${id}\`;
          loadingIndicator.appendChild(element);
        }

        element.className = \`nes-text \${
          status === 'loaded' ? 'is-success' : 'is-warning'
        }\`;
        element.innerHTML = \`\${id}: \${
          status === 'loaded' ? 'Loaded!' : 'Loading...'
        }\`;

        loadingIndicator.scrollTop = loadingIndicator.scrollHeight;
      };
      window.HCSReady = async function () {
        console.log(
          'All scripts and WASM modules loaded, initializing demo',
          window.HCS
        );

        const rustWasm = window.HCS.LoadedWasm['rust-wasm'].exports;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          75,
          window.innerWidth / window.innerHeight,
          0.1,
          1000
        );
        const renderer = new THREE.WebGLRenderer({
          canvas: document.getElementById('myCanvas'),
          antialias: true,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000033);

        const characterGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const characterMaterial = new THREE.MeshBasicMaterial({
          color: 0xff0000,
        });
        const character = new THREE.Mesh(characterGeometry, characterMaterial);
        scene.add(character);

        camera.position.z = 5;

        anime({
          targets: character.position,
          x: [-2, 2],
          duration: 2000,
          easing: 'easeInOutQuad',
          loop: true,
          direction: 'alternate',
        });

        let frame = 0;
        function animate() {
          requestAnimationFrame(animate);

          if (rustWasm.update_position) {
            frame = rustWasm.update_position(frame);
            character.position.y = Math.sin(frame * 0.1) * 0.5;
          }

          renderer.render(scene, camera);
        }

        animate();
        console.log('Animation started');

        window.addEventListener(
          'resize',
          function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
          },
          false
        );

        console.log('Scene setup complete');
      };
    </script>
  </body>
</html>`;

  fs.writeFileSync(path.join(projectPath, 'index.html'), htmlContent);

  const readmeContent = `# HCS Recursion Example

This is a basic example of using the HCS Recursion SDK.

## Getting Started

1. Open index.html in your browser
2. You should see a red cube moving back and forth with WASM-powered vertical movement

## Features

- Three.js integration
- Anime.js animation
- WASM module integration
- HCS Recursion SDK configuration
`;

  fs.writeFileSync(path.join(projectPath, 'README.md'), readmeContent);

  console.log(`
Successfully created ${projectName}!
Starting local server...
`);

  const server = http.createServer((req, res) => {
    return handler(req, res, {
      public: projectPath,
    });
  });

  server.listen(3000, async () => {
    console.log('Opening example in your browser...');
    await open('http://localhost:3000');
    console.log(`
Server running at http://localhost:3000
Press Ctrl+C to stop the server
    `);
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit();
  });
};

createProject().catch(console.error);
