import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from './jsm/webxr/ARButton.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { InteractionManager } from './InteractionManager.js';
import { setupUIControls } from './uiControls.js';
import { showConfirmationModal } from './modalManager.js';

// Removed socket initialization and host-related variables.
class App {
  constructor() {
    // ----- Shared Variables -----
    this.loadedModels = new Map();
    this.draggableObjects = [];
    this.isARMode = false;
    this.isPlacingProduct = false;
    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerActive = true;
    
    // Remove host determinations.
    // Initialize overlays.
    this.createLoadingOverlay();
    this.createUploadOverlay();

    // Set up THREE.LoadingManager.
    this.loadingManager = new THREE.LoadingManager(() => {});
    this.loadingManager.onProgress = (url, loaded, total) => {};
    
    // Load GLTFLoader.
    import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js').then((module) => { 
      this.gltfLoader = new module.GLTFLoader(this.loadingManager);
    });

    this.rgbeLoader = new RGBELoader(this.loadingManager);

    this.init();
    this.setupScene();
    this.setupLights();
    this.setupInitialControls();

    // Set up UI controls.
    setupUIControls(this);
    
    // File Upload Handling.
    const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
    if (fileInput) {
      fileInput.onchange = async (event) => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
  
        const files = event.target.files;
        if (!files || files.length === 0) {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
          return;
        }
  
        this.clearExistingModels();
  
        for (let file of files) {
          const formData = new FormData();
          formData.append('model', file);
          try {
            const response = await fetch('/upload', {
              method: 'POST',
              body: formData
            });
            if (response.ok) {
              const data = await response.json();
              // For local operation, load the model immediately.
              const name = data.name.replace('.glb', '').replace('.gltf', '');
              await this.loadModel(data.url, name);
            } else {
              console.error("Upload failed:", response.statusText);
            }
          } catch (error) {
            console.error("File upload error:", error);
          }
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      };
    }

    // Create an InteractionManager instance.
    this.interactionManager = new InteractionManager(
      this.scene,
      this.camera,
      this.renderer,
      this.renderer.domElement
    );

    window.app = this;

    window.addEventListener('pointermove', this.handlePointerMove.bind(this));

    this.renderer.xr.addEventListener('sessionstart', this.onARSessionStart.bind(this));
    
    this.renderer.xr.addEventListener('sessionend', () => {
      console.log("AR session ended");
      this.isARMode = false;
      this.scene.background = new THREE.Color(0xc0c0c1);
      this.renderer.setClearColor(0xc0c0c1, 1);
      
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
    });
  
    this.showLandingOverlay();

    this.animate();
  }

  ensureFontAwesomeLoaded() {
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      document.head.appendChild(link);
    }
  }

  createARRotationControls() {
    this.rotateLeftBtn = document.createElement('button');
    this.rotateLeftBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    this.rotateLeftBtn.style.position = 'absolute';
    this.rotateLeftBtn.style.bottom = '80px';
    this.rotateLeftBtn.style.right = 'calc(50% + 60px)';
    this.rotateLeftBtn.style.padding = '8px 16px';
    this.rotateLeftBtn.style.border = 'none';
    this.rotateLeftBtn.style.borderRadius = '4px';
    this.rotateLeftBtn.style.background = '#fff';
    this.rotateLeftBtn.style.color = '#000';
    this.rotateLeftBtn.style.fontSize = '13px';
    this.rotateLeftBtn.style.cursor = 'pointer';
    this.rotateLeftBtn.style.zIndex = '10000';
    this.rotateLeftBtn.style.display = 'none';
    this.rotateLeftBtn.onclick = () => this.rotateModel('y', -0.2);
    document.body.appendChild(this.rotateLeftBtn);
    
    this.rotateRightBtn = document.createElement('button');
    this.rotateRightBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    this.rotateRightBtn.style.position = 'absolute';
    this.rotateRightBtn.style.bottom = '80px';
    this.rotateRightBtn.style.left = 'calc(50% + 60px)';
    this.rotateRightBtn.style.padding = '8px 16px';
    this.rotateRightBtn.style.border = 'none';
    this.rotateRightBtn.style.borderRadius = '4px';
    this.rotateRightBtn.style.background = '#fff';
    this.rotateRightBtn.style.color = '#000';
    this.rotateRightBtn.style.fontSize = '13px';
    this.rotateRightBtn.style.cursor = 'pointer';
    this.rotateRightBtn.style.zIndex = '10000';
    this.rotateRightBtn.style.display = 'none';
    this.rotateRightBtn.onclick = () => this.rotateModel('y', 0.2);
    document.body.appendChild(this.rotateRightBtn);
  }

  rotateModel(axis, angle) {
    if (!this.productGroup) return;
    if (axis.toLowerCase() === 'y') {
      this.productGroup.rotation.y += angle;
    }
  }

  showLandingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'landing-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = '#cccccc';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';

    const box = document.createElement('div');
    box.style.backgroundColor = 'white';
    box.style.padding = '30px';
    box.style.borderRadius = '8px';
    box.style.textAlign = 'center';
    box.style.width = '300px';

    const title = document.createElement('h1');
    title.style.margin = '0 0 10px';
    title.innerHTML = 'SyncVision <span style="font-size: 16px; font-weight: normal;">by kool</span>';

    const description = document.createElement('p');
    description.style.fontSize = '14px';
    description.style.color = '#333';
    description.style.marginBottom = '20px';
    description.innerHTML = '<p> Click the Browse button to browse existing files, or Upload button to upload GLB files to view new ideas.</p> <p>Experience interactive product development like never before!</p> <p style="font-size: 12px;">(pending name &amp; content)</p>';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.justifyContent = 'space-around';

    const uploadButton = document.createElement('button');
    uploadButton.textContent = 'Upload';
    uploadButton.style.backgroundColor = '#d00024';
    uploadButton.style.color = 'white';
    uploadButton.style.border = 'none';
    uploadButton.style.borderRadius = '9999px';
    uploadButton.style.padding = '10px 20px';
    uploadButton.style.cursor = 'pointer';
    uploadButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      const fileInput = document.querySelector('input[type="file"][accept=".glb,.gltf"]');
      if (fileInput) {
        fileInput.click();
      }
    });
    
    const browseButton = document.createElement('button');
    browseButton.textContent = 'Browse';
    browseButton.style.backgroundColor = '#d00024';
    browseButton.style.color = 'white';
    browseButton.style.border = 'none';
    browseButton.style.borderRadius = '9999px';
    browseButton.style.padding = '10px 20px';
    browseButton.style.cursor = 'pointer';
    browseButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      this.showBrowseInterface();
    });

    buttonsContainer.appendChild(browseButton);
    buttonsContainer.appendChild(uploadButton);
    box.appendChild(title);
    box.appendChild(description);
    box.appendChild(buttonsContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async showBrowseInterface() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
      const response = await fetch('/list-uploads');
      const files = await response.json();
    
      if (loadingOverlay) loadingOverlay.style.display = 'none';

      const modalOverlay = document.createElement('div');
      modalOverlay.style.position = 'fixed';
      modalOverlay.style.top = '0';
      modalOverlay.style.left = '0';
      modalOverlay.style.width = '100%';
      modalOverlay.style.height = '100%';
      modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
      modalOverlay.style.display = 'flex';
      modalOverlay.style.alignItems = 'center';
      modalOverlay.style.justifyContent = 'center';
      modalOverlay.style.zIndex = '10000';
      
      const modalContainer = document.createElement('div');
      modalContainer.style.backgroundColor = 'white';
      modalContainer.style.padding = '20px';
      modalContainer.style.borderRadius = '8px';
      modalContainer.style.minWidth = '300px';
      modalContainer.style.maxHeight = '80%';
      modalContainer.style.overflowY = 'auto';
      
      const title = document.createElement('h2');
      title.textContent = 'Browse Uploaded Models';
      modalContainer.appendChild(title);

      const description = document.createElement('p');
      description.textContent = 'To view the full product, ensure all parts are selected if it has multiple components.';
      modalContainer.appendChild(description);
      
      const fileList = document.createElement('div');
      fileList.style.marginTop = '10px';
      files.forEach(file => {
        const div = document.createElement('div');
        div.style.marginBottom = '5px';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = file.url;
        checkbox.id = file.name;
        const label = document.createElement('label');
        label.htmlFor = file.name;
        label.textContent = file.name;
        label.style.marginLeft = '5px';
        div.appendChild(checkbox);
        div.appendChild(label);
        fileList.appendChild(div);
      });
      modalContainer.appendChild(fileList);
      
      const buttonsDiv = document.createElement('div');
      buttonsDiv.style.marginTop = '20px';
      buttonsDiv.style.textAlign = 'right';
      
      const loadButton = document.createElement('button');
      loadButton.textContent = 'Load Selected';
      loadButton.style.marginLeft = '10px';
      loadButton.style.padding = '8px 16px';
      loadButton.style.border = 'none';
      loadButton.style.borderRadius = '9999px';
      loadButton.style.background = '#d00024';
      loadButton.style.color = 'white';
      loadButton.style.cursor = 'pointer';
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.padding = '8px 16px';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '9999px';
      cancelButton.style.background = '#999';
      cancelButton.style.color = 'white';
      cancelButton.style.cursor = 'pointer';
      
      buttonsDiv.appendChild(cancelButton);
      buttonsDiv.appendChild(loadButton);
      modalContainer.appendChild(buttonsDiv);
      modalOverlay.appendChild(modalContainer);
      document.body.appendChild(modalOverlay);
      
      loadButton.addEventListener('click', async () => {
        const selected = [];
        fileList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
          selected.push({ url: cb.value, name: cb.id });
        });
        
        if(selected.length > 0) {
          document.body.removeChild(modalOverlay);
          if (loadingOverlay) loadingOverlay.style.display = 'flex';
          
          this.clearExistingModels();
          for(const file of selected) {
            await this.loadModel(file.url, file.name);
          }
          this.fitCameraToScene();
          if (loadingOverlay) loadingOverlay.style.display = 'none';
        } else {
          document.body.removeChild(modalOverlay);
        }
      });
      
      cancelButton.addEventListener('click', () => {
          document.body.removeChild(modalOverlay);
      });
    } catch (error) {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      console.error("Error fetching uploaded models:", error);
    }
  }

  handlePointerMove(event) {
    this.pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  onTouchStart(e) {
    if (!this.isARMode) {
      if (e.touches.length === 2 && this.productGroup && this.productGroup.visible) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this.lastTouchAngle = Math.atan2(dy, dx);
      }
      return;
    }
    
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.initialRotationY = this.productGroup ? this.productGroup.rotation.y : 0;
      this.isSingleTouchRotating = true;
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      this.lastTouchAngle = Math.atan2(dy, dx);
    }
  }

  onTouchMove(e) {
    if (!this.isARMode) {
      if (e.touches.length === 2 && this.lastTouchAngle !== null && 
          this.productGroup && this.productGroup.visible) {
          const dx = e.touches[1].clientX - e.touches[0].clientX;
          const dy = e.touches[1].clientY - e.touches[0].clientY;
          const currentAngle = Math.atan2(dy, dx);
          const angleDiff = currentAngle - this.lastTouchAngle;
          this.productGroup.rotation.y += angleDiff;
          this.lastTouchAngle = currentAngle;
          e.preventDefault();
      }
      return;
    }
    
    if (this.productGroup && this.productGroup.visible) {
      if (this.isSingleTouchRotating && e.touches.length === 1) {
        const touchX = e.touches[0].clientX;
        const touchDeltaX = touchX - this.touchStartX;
        const rotationFactor = 0.01;
        this.productGroup.rotation.y = this.initialRotationY + (touchDeltaX * rotationFactor);
        e.preventDefault();
      } else if (e.touches.length === 2 && this.lastTouchAngle !== null) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const currentAngle = Math.atan2(dy, dx);
        const angleDiff = currentAngle - this.lastTouchAngle;
        this.productGroup.rotation.y += angleDiff;
        this.lastTouchAngle = currentAngle;
        e.preventDefault();
      }
    }
  }

  onTouchEnd(e) {
    if (e.touches.length < 2) {
      this.lastTouchAngle = null;
    }
    
    if (e.touches.length === 0) {
      this.isSingleTouchRotating = false;
    }
  }

  createUploadOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'upload-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.color = 'white';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontSize = '24px';
    overlay.style.zIndex = '3000';
    overlay.textContent = 'Uploading new product. Please wait.';
    document.body.appendChild(overlay);
    this.uploadOverlay = overlay;
  }

  showUploadOverlay() {
    if (this.uploadOverlay) {
      this.uploadOverlay.style.display = 'flex';
    }
  }

  hideUploadOverlay() {
    if (this.uploadOverlay) {
      this.uploadOverlay.style.display = 'none';
    }
  }

  createLoadingOverlay() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = '#cccccc';
      overlay.style.display = 'none';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '9999';
      overlay.innerHTML = `
        <div id="loading-spinner" style="
          border: 11px solid #d00024;
          border-top: 11px solid #f3f3f3;
          border-radius: 50%;
          width: 84px;
          height: 84px;
          animation: spin 2s linear infinite;
        "></div>
        <div id="loading-text" style="
          color: #333;
          margin-top: 20px;
          font-size: 14px;
          font-family: sans-serif;
        ">
          Loading...
        </div>
      `;
      document.body.appendChild(overlay);

      if (!document.getElementById('loading-overlay-style')) {
        const style = document.createElement('style');
        style.id = 'loading-overlay-style';
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  }

  init() {
    this.container = document.getElementById('scene-container');
    this.scene = new THREE.Scene();

    this.productGroup = new THREE.Group();
    this.scene.add(this.productGroup);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  setupScene() {
    this.scene.background = new THREE.Color(0xc0c0c1);
    this.createFloor();
    this.rgbeLoader.load(
      '../assets/brown_photostudio_02_1k.hdr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.renderer.physicallyCorrectLights = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.5;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
    );
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(-5, 30, 5);
    directionalLight.castShadow = true;
    
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.intensity = 5;
    
    const shadowSize = 10;
    directionalLight.shadow.camera.left = -shadowSize;
    directionalLight.shadow.camera.right = shadowSize;
    directionalLight.shadow.camera.top = shadowSize;
    directionalLight.shadow.camera.bottom = -shadowSize;
    
    directionalLight.shadow.bias = -0.0005;
    directionalLight.shadow.normalBias = 0.02;

    this.scene.add(directionalLight);
  }

  createFloor() {
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xbbbbbb,
        roughness: 0.8,
        metalness: 0.2,
        transparent: this.isARMode,
        opacity: this.isARMode ? 0.1 : 1.5
    });
    const browserFloorMaterial = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.floor = new THREE.Mesh(floorGeometry, 
      this.isARMode ? floorMaterial : browserFloorMaterial);
    this.floor.receiveShadow = true;
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    return this.floor;
  }

  setupInitialControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.rotateSpeed = 0.5;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.addEventListener('change', () => {
      // No broadcasting.
    });
  }

  updateDragControls() {
    const draggableObjects = Array.from(this.loadedModels.values());
    if (this.interactionManager) {
      this.interactionManager.setDraggableObjects(draggableObjects);
    }
  }

  clearExistingModels() {
    this.loadedModels.forEach(model => {
      if (model.parent) {
        this.productGroup.remove(model);
      }
    });
    this.loadedModels.clear();
    this.draggableObjects.length = 0;
    this.updateDragControls();
  }

  // async loadDefaultProduct() {
  //   const loadingOverlay = document.getElementById('loading-overlay');
  //   if (loadingOverlay) {
  //     loadingOverlay.style.display = 'flex';
  //   }
  //   this.clearExistingModels();
  //   const parts = [
  //     { name: 'blade', file: 'kool-mandoline-blade.glb' },
  //     { name: 'frame', file: 'kool-mandoline-frame.glb' },
  //     { name: 'handguard', file: 'kool-mandoline-handguard.glb' },
  //     { name: 'handle', file: 'kool-mandoline-handletpe.glb' }
  //   ];
    
  //   for (const part of parts) {
  //     await new Promise((resolve, reject) => {
  //       this.gltfLoader.load(
  //         `assets/${part.file}`,
  //         (gltf) => {
  //           const model = gltf.scene;
  //           const container = new THREE.Group();
  //           container.name = part.name;
  //           container.userData.isDraggable = true;
  //           container.add(model);
  //           container.raycast = function (raycaster, intersects) {
  //             const box = new THREE.Box3().setFromObject(container);
  //             if (!box.isEmpty()) {
  //               const intersectionPoint = new THREE.Vector3();
  //               if (raycaster.ray.intersectBox(box, intersectionPoint)) {
  //                 const distance = raycaster.ray.origin.distanceTo(intersectionPoint);
  //                 intersects.push({
  //                   distance: distance,
  //                   point: intersectionPoint.clone(),
  //                   object: container
  //                 });
  //               }
  //             }
  //           };

  //           this.draggableObjects.push(container);
  //           this.productGroup.add(container);
  //           this.loadedModels.set(part.name, container);
  //           this.updateDragControls();
  //           if (this.interactionManager) {
  //             this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
  //           }
  //           this.fitCameraToScene();
  //           resolve();
  //         },
  //         undefined,
  //         (error) => {
  //           console.error(`Error loading model ${part.file}:`, error);
  //           reject(error);
  //         }
  //       );
  //     });
  //   }
  //   if (loadingOverlay) {
  //     loadingOverlay.style.display = 'none';
  //   }
  // }

  fitCameraToScene() {
    const box = new THREE.Box3().setFromObject(this.productGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRadians = this.camera.fov * (Math.PI / 180);
    let distance = Math.abs(maxDim / Math.tan(fovRadians / 2));
    distance *= 1.2;
    
    const offsetAngle = Math.PI / 4;
    const xOffset = distance * Math.cos(offsetAngle);
    const zOffset = distance * Math.sin(offsetAngle);
    const yOffset = distance * 0.5;
    
    this.camera.position.set(center.x + xOffset, center.y + yOffset, center.z + zOffset);
    this.orbitControls.target.copy(center);
    this.camera.updateProjectionMatrix();
    this.orbitControls.update();
    
    if (this.interactionManager && this.interactionManager.orbitControls) {
      this.interactionManager.orbitControls.target.copy(center);
      this.interactionManager.orbitControls.update();
    }
  }

  async loadModel(url, name) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.traverse(node => {
            if (node.isMesh) {
              node.castShadow = true;
            }
          });
          const container = new THREE.Group();
          container.name = name;
          container.userData.isDraggable = true;
          container.add(model);
          container.raycast = function(raycaster, intersects) {
            const tempIntersects = [];
            this.children.forEach(child => {
              child.traverse(object => {
                if (object.isMesh) {
                  const originalMatrixAutoUpdate = object.matrixAutoUpdate;
                  object.matrixAutoUpdate = true;
                  object.updateMatrixWorld(true);
                  object.raycast(raycaster, tempIntersects);
                  object.matrixAutoUpdate = originalMatrixAutoUpdate;
                }
              });
            });
            if (tempIntersects.length > 0) {
              intersects.push({
                distance: tempIntersects[0].distance,
                point: tempIntersects[0].point.clone(),
                object: this
              });
            }
          };

          this.draggableObjects.push(container);
          this.productGroup.add(container);
          this.loadedModels.set(name, container);
          
          if (this.interactionManager) {
            this.interactionManager.setDraggableObjects(Array.from(this.loadedModels.values()));
          }
          
          this.fitCameraToScene();
          console.log(`Loaded model: ${name}`);
          resolve(container);
        },
        xhr => {},
        error => {
          console.error(`Error loading model ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  onARSessionStart() {
    console.log("AR session started - entering tap-to-place mode");
    this.isARMode = true;
    this.isPlacingProduct = true;
    
    if (this.productGroup) {
      this.productGroup.visible = false;
    }

    if (this.floor) {
      this.scene.remove(this.floor);
      const floorGeometry = new THREE.PlaneGeometry(20, 20);
      const shadowMaterial = new THREE.ShadowMaterial({
        opacity: 0.05
      });
      
      this.floor = new THREE.Mesh(floorGeometry, shadowMaterial);
      this.floor.receiveShadow = true;
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.visible = false;
      this.scene.add(this.floor);
    }
    
    if (!this.placementReticle) {
      this.createPlacementUI();
      this.placementMessage.style.display = 'block';
    } else {
      this.placementMessage.style.display = 'block';
      this.placeAgainButton.style.display = 'none';
    }
    
    if (!this.rotateLeftBtn || !this.rotateRightBtn) {
      this.createARRotationControls();
    }
    
    if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
    if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
    
    const arButton = document.querySelector('.ar-button');
    if (arButton) {
      arButton.style.display = 'none';
    }
    
    const session = this.renderer.xr.getSession();
    
    if (session) {
      session.requestReferenceSpace('local-floor')
        .catch((err) => {
          console.warn("local-floor reference space unavailable, falling back to viewer:", err);
          return session.requestReferenceSpace('viewer');
        })
        .then((referenceSpace) => {
          return session.requestHitTestSource({ space: referenceSpace });
        })
        .then((source) => {
          this.hitTestSource = source;
        })
        .catch((err) => {
          console.error("Failed to obtain hit test source:", err);
        });
    
      this.onSelectEventBound = this.onSelectEvent.bind(this);
      session.addEventListener('select', this.onSelectEventBound);
      session.addEventListener('end', () => {
        this.hitTestSource = null;
      });
    }
  }

  createPlacementUI() {
    this.placementReticle = new THREE.Group();
    this.placementReticle.scale.set(0.3, 0.3, 0.3);
  
    const ringGeometry = new THREE.RingGeometry(0.15, 0.2, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const reticleRing = new THREE.Mesh(ringGeometry, ringMaterial);
    reticleRing.rotation.x = -Math.PI / 2;
    this.placementReticle.add(reticleRing);
  
    const dotGeometry = new THREE.CircleGeometry(0.05, 32);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const reticleDot = new THREE.Mesh(dotGeometry, dotMaterial);
    reticleDot.rotation.x = -Math.PI / 2;
    this.placementReticle.add(reticleDot);
  
    this.placementReticle.visible = false;
    this.scene.add(this.placementReticle);
  
    this.placementMessage = document.createElement('div');
    this.placementMessage.style.position = 'absolute';
    this.placementMessage.style.bottom = '100px';
    this.placementMessage.style.left = '50%';
    this.placementMessage.style.transform = 'translateX(-50%)';
    this.placementMessage.style.fontSize = '20px';
    this.placementMessage.style.color = 'white';
    this.placementMessage.style.zIndex = '10000';
    this.placementMessage.innerText = 'Please tap to place';
    this.placementMessage.style.display = 'none';
    document.body.appendChild(this.placementMessage);
  
    this.placeAgainButton = document.createElement('button');
    this.placeAgainButton.textContent = 'Place Again';
    this.placeAgainButton.style.position = 'absolute';
    this.placeAgainButton.style.bottom = '80px';
    this.placeAgainButton.style.left = '50%';
    this.placeAgainButton.style.transform = 'translateX(-50%)';
    this.placeAgainButton.style.padding = '8px 16px';
    this.placeAgainButton.style.border = 'none';
    this.placeAgainButton.style.borderRadius = '4px';
    this.placeAgainButton.style.background = '#fff';
    this.placeAgainButton.style.color = '#000';
    this.placeAgainButton.style.fontSize = '13px';
    this.placeAgainButton.style.cursor = 'pointer';
    this.placeAgainButton.style.zIndex = '10000';
    this.placeAgainButton.style.display = 'none';
    document.body.appendChild(this.placeAgainButton);
  
    this.placeAgainButton.addEventListener('click', () => {
      if (this.productGroup) {
        this.productGroup.visible = false;
      }
      this.isPlacingProduct = true;
      this.placementMessage.style.display = 'block';
      this.placeAgainButton.style.display = 'none';
      
      if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'none';
      if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'none';
      
      const session = this.renderer.xr.getSession();
      if (session) {
        this.onSelectEventBound = this.onSelectEvent.bind(this);
        session.addEventListener('select', this.onSelectEventBound);
      }
    });
  }

  onSelectEvent(event) {
    if (this.isPlacingProduct && this.hitTestSource) {
      const frame = event.frame;
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
  
        const bbox = new THREE.Box3().setFromObject(this.productGroup);
        const offsetY = bbox.min.y;
  
        this.productGroup.visible = true;
        this.productGroup.position.set(
          pose.transform.position.x,
          pose.transform.position.y - offsetY,
          pose.transform.position.z
        );

        if (this.floor) {
          this.floor.position.set(
            pose.transform.position.x,
            pose.transform.position.y,
            pose.transform.position.z
          );
          this.floor.visible = true;
        }
        console.log("Product placed at:", pose.transform.position, "with vertical offset:", offsetY);
  
        this.isPlacingProduct = false;
        this.placementMessage.style.display = 'none';
        if (this.placementReticle) {
          this.placementReticle.visible = false;
        }
        this.placeAgainButton.style.display = 'block';
        
        if (this.rotateLeftBtn) this.rotateLeftBtn.style.display = 'block';
        if (this.rotateRightBtn) this.rotateRightBtn.style.display = 'block';
        
        const session = this.renderer.xr.getSession();
        session.removeEventListener('select', this.onSelectEventBound);
      }
    }
  }

  animate() {
    this.renderer.setAnimationLoop((time, frame) => {
      if (this.isARMode && this.isPlacingProduct && this.hitTestSource && frame) {
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          if (this.placementReticle) {
            this.placementReticle.visible = true;
            this.placementReticle.position.set(
              pose.transform.position.x,
              pose.transform.position.y,
              pose.transform.position.z
            );
          }
        } else {
          if (this.placementReticle) {
            this.placementReticle.visible = false;
          }
        }
      }
      
      if (!this.isDragging) {
        this.orbitControls.update();
      }
      if (this.interactionManager) {
        this.interactionManager.update();
      }
      this.renderer.render(this.scene, this.camera);
    });
  }
}

window.FileManager = {
  listFiles: function() {
    return fetch('/list-uploads')
      .then(response => response.json())
      .then(files => {
        console.log("=== Uploaded Files ===");
        if (files.length === 0) {
          console.log("No files found");
        } else {
          files.forEach(file => console.log(file.name));
        }
        return files;
      })
      .catch(error => {
        console.error("Error listing files:", error);
      });
  },
  
  deleteFile: function(filename) {
    return fetch(`/delete-upload/${filename}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      console.log(data.message || data.error);
      return data;
    })
    .catch(error => {
      console.error("Error deleting file:", error);
    });
  },
  
  deleteAllFiles: function() {
    if (!confirm("Are you sure you want to delete ALL uploaded files?")) {
      console.log("Operation cancelled");
      return Promise.resolve({message: "Operation cancelled"});
    }
    
    return fetch('/delete-all-uploads', {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      console.log(data.message || data.error);
      return data;
    })
    .catch(error => {
      console.error("Error deleting files:", error);
    });
  },
  
  help: function() {
    console.log(`
=== File Manager Commands ===
FileManager.listFiles() - List all uploaded files
FileManager.deleteFile("filename.glb") - Delete a specific file
FileManager.deleteAllFiles() - Delete all uploaded files
FileManager.help() - Show this help information
    `);
  }
};

console.log("File Manager utilities loaded. Type FileManager.help() for available commands.");
const app = new App();
export default app;