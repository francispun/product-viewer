import * as THREE from 'https://unpkg.com/three@0.141.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.141.0/examples/jsm/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'https://unpkg.com/three@0.141.0/examples/jsm/webxr/XRControllerModelFactory.js';
export class InteractionManager {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;

    // Flag for XR session (AR or VR)
    this.isXRSessionActive = false;
    // Flag for whether rotation mode is active (when squeeze is pressed)
    this.rotationMode = false;
    // To store the controller's quaternion and object's quaternion at the start of a rotation
    this.startControllerQuaternion = new THREE.Quaternion();
    this.startObjectQuaternion = new THREE.Quaternion();

    this.selectedObject = null;
    this.activeController = null;
    this.lastControllerPosition = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.draggableObjects = [];
    this.isDragging = false;
    
    // Mouse/touch position tracking for non-XR dragging
    this.mouse = new THREE.Vector2();
    this.lastMousePosition = new THREE.Vector2();
    this.lastDragPoint = null;
    
    // Store original OrbitControls event handlers
    this.originalOrbitControlHandlers = {
      onMouseDown: null,
      onMouseMove: null,
      onMouseUp: null,
      onTouchStart: null,
      onTouchMove: null,
      onTouchEnd: null
    };

    this.setupOrbitControls();
    this.setupXRControllers();
    
    // Add event listeners for mouse/touch interaction
    this.setupMouseTouchEvents();
    
    if (this.renderer) {
      // Listen for session start/end events.
      this.renderer.xr.addEventListener('sessionstart', () => {
        console.log("XR session started");
        this.isXRSessionActive = true;
        if (this.controller1) this.controller1.visible = true;
        if (this.controller2) this.controller2.visible = true;
        if (this.controllerGrip1) this.controllerGrip1.visible = true;
        if (this.controllerGrip2) this.controllerGrip2.visible = true;
      });
      
      this.renderer.xr.addEventListener('sessionend', () => {
        console.log("XR session ended");
        this.isXRSessionActive = false;
        this.rotationMode = false;
      });
    }
  }

  setupOrbitControls() {
    if (window.app && window.app.orbitControls) {
      this.orbitControls = window.app.orbitControls;
    } else {
      this.orbitControls = new OrbitControls(this.camera, this.domElement);
      this.orbitControls.rotateSpeed = 0.01;
      this.orbitControls.enableDamping = true;
      this.orbitControls.dampingFactor = 0.05;
    }
  }

  setupMouseTouchEvents() {
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this), true);
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), true);
    document.addEventListener('mouseup', this.onMouseUp.bind(this), true);
    
    this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false, capture: true });
    this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false, capture: true });
    document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false, capture: true });
    document.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false, capture: true });
  }
  
  onMouseDown(event) {
    if (this.isXRSessionActive) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.draggableObjects, true);
    
    if (intersects.length > 0) {
      let object = intersects[0].object;
      let topLevelDraggable = null;
      while (object) {
        if (this.draggableObjects.includes(object)) {
          topLevelDraggable = object;
        }
        if (object === this.scene) break;
        object = object.parent;
      }
      
      if (topLevelDraggable) {
        this.disableOrbitControls();
        this.isDragging = true;
        this.selectedObject = topLevelDraggable;
        
        event.stopPropagation();
        event.preventDefault();
        
        this.lastMousePosition.x = event.clientX;
        this.lastMousePosition.y = event.clientY;
        this.lastDragPoint = null;
        
        console.log("Selected for drag:", this.selectedObject.name);
        return false;
      }
    }
  }
  
  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    if (this.isDragging && this.selectedObject) {
      event.stopPropagation();
      event.preventDefault();
      this.handleDrag(event.clientX, event.clientY);
      return false;
    }
  }
  
  onMouseUp(event) {
    if (this.isDragging) {
      this.enableOrbitControls();
      this.isDragging = false;
      this.selectedObject = null;
      this.lastDragPoint = null;
      
      event.stopPropagation();
      event.preventDefault();
      return false;
    }
  }
  
  onTouchStart(event) {
    if (this.isXRSessionActive) return;
    if (event.touches.length !== 1) return;
    
    const touch = event.touches[0];
    this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.draggableObjects, true);
    
    if (intersects.length > 0) {
      let object = intersects[0].object;
      let topLevelDraggable = null;
      while (object) {
        if (this.draggableObjects.includes(object)) {
          topLevelDraggable = object;
        }
        if (object === this.scene) break;
        object = object.parent;
      }
      
      if (topLevelDraggable) {
        this.disableOrbitControls();
        this.isDragging = true;
        this.selectedObject = topLevelDraggable;
        
        event.stopPropagation();
        event.preventDefault();
        
        this.lastMousePosition.x = touch.clientX;
        this.lastMousePosition.y = touch.clientY;
        this.lastDragPoint = null;
        
        console.log("Selected for drag (touch):", this.selectedObject.name);
        return false;
      }
    }
  }
  
  onTouchMove(event) {
    if (!this.isDragging || !this.selectedObject) return;
    if (event.touches.length !== 1) return;
    
    const touch = event.touches[0];
    this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
    
    event.stopPropagation();
    event.preventDefault();
    this.handleDrag(touch.clientX, touch.clientY);
    return false;
  }
  
  onTouchEnd(event) {
    if (this.isDragging) {
      this.enableOrbitControls();
      this.isDragging = false;
      this.selectedObject = null;
      this.lastDragPoint = null;
      
      event.stopPropagation();
      event.preventDefault();
      return false;
    }
  }
  
  disableOrbitControls() {
    if (this.orbitControls) {
      this.orbitControls.enabled = false;
      this.orbitControls.enableRotate = false;
      this.orbitControls.enablePan = false;
      this.orbitControls.enableZoom = false;
    }
    if (window.app && window.app.orbitControls) {
      const controls = window.app.orbitControls;
      controls.enabled = false;
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = false;
    }
  }
  
  enableOrbitControls() {
    if (this.orbitControls) {
      this.orbitControls.enabled = true;
      this.orbitControls.enableRotate = true;
      this.orbitControls.enablePan = true;
      this.orbitControls.enableZoom = true;
    }
    if (window.app && window.app.orbitControls) {
      const controls = window.app.orbitControls;
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.enableZoom = true;
    }
  }
  
  handleDrag(clientX, clientY) {
    if (!this.selectedObject) return;
    
    const deltaX = clientX - this.lastMousePosition.x;
    const deltaY = clientY - this.lastMousePosition.y;
    
    this.lastMousePosition.x = clientX;
    this.lastMousePosition.y = clientY;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      this.selectedObject.position
    );
    
    const intersectionPoint = new THREE.Vector3();
    const rayIntersectsPlane = this.raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    if (rayIntersectsPlane) {
      if (!this.lastDragPoint) {
        this.lastDragPoint = intersectionPoint.clone();
      } else {
        const dragDelta = new THREE.Vector3().subVectors(intersectionPoint, this.lastDragPoint);
        this.selectedObject.position.add(dragDelta);
        if (this.selectedObject.userData.originalScale) {
          this.selectedObject.scale.copy(this.selectedObject.userData.originalScale);
        }
        this.lastDragPoint.copy(intersectionPoint);
      }
    }
  }
  
  setupXRControllers() {
    if (!this.renderer) return;
    
    console.log("Setting up XR controllers");
    
    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -10], 3));
    
    const rayMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
    });
    
    const controllerModelFactory = new XRControllerModelFactory();
    
    this.controller1 = this.renderer.xr.getController(0);
    this.controller1.name = "controller-right";
    this.scene.add(this.controller1);
    const controllerRay1 = new THREE.Line(rayGeometry, rayMaterial);
    controllerRay1.name = "controller-ray";
    this.controller1.add(controllerRay1);
    this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
    this.scene.add(this.controllerGrip1);
    
    this.controller2 = this.renderer.xr.getController(1);
    this.controller2.name = "controller-left";
    this.scene.add(this.controller2);
    const controllerRay2 = new THREE.Line(rayGeometry, rayMaterial);
    controllerRay2.name = "controller-ray";
    this.controller2.add(controllerRay2);
    this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
    this.scene.add(this.controllerGrip2);
    
    this.controller1.addEventListener('selectstart', this.onControllerSelectStart.bind(this));
    this.controller1.addEventListener('selectend', this.onControllerSelectEnd.bind(this));
    this.controller2.addEventListener('selectstart', this.onControllerSelectStart.bind(this));
    this.controller2.addEventListener('selectend', this.onControllerSelectEnd.bind(this));
    
    this.controller1.addEventListener('squeezestart', this.onControllerSqueezeStart.bind(this));
    this.controller1.addEventListener('squeezeend', this.onControllerSqueezeEnd.bind(this));
    this.controller2.addEventListener('squeezestart', this.onControllerSqueezeStart.bind(this));
    this.controller2.addEventListener('squeezeend', this.onControllerSqueezeEnd.bind(this));

    console.log("XR controllers initialized");
  }
  
  onControllerSelectStart(event) {
    const controller = event.target;
    console.log("Controller select start");
    
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    const allIntersects = [];
    this.raycaster.intersectObjects(this.scene.children, true, allIntersects);
    
    if (allIntersects.length > 0) {
      let object = allIntersects[0].object;
      let topLevelDraggable = null;
      while (object) {
        if (this.draggableObjects.includes(object)) {
          topLevelDraggable = object;
        }
        if (object === this.scene) break;
        object = object.parent;
      }
      
      if (topLevelDraggable) {
        console.log("Selected object:", topLevelDraggable.name || topLevelDraggable.uuid);
        this.selectedObject = topLevelDraggable;
        this.activeController = controller;
        this.lastControllerPosition.setFromMatrixPosition(controller.matrixWorld);
      }
    }
  }
  
  onControllerSelectEnd() {
    console.log("Controller select end");
    this.selectedObject = null;
    this.activeController = null;
    this.rotationMode = false;
  }

  onControllerSqueezeStart(event) {
    const controller = event.target;
    console.log("Squeeze start");
    if (this.selectedObject) {
      this.rotationMode = true;
      this.startControllerQuaternion.copy(controller.quaternion);
      this.startObjectQuaternion.copy(this.selectedObject.quaternion);
    }
  }

  onControllerSqueezeEnd(event) {
    console.log("Squeeze end");
    this.rotationMode = false;
  }

  getDraggableObjects() {
    return [...this.draggableObjects];
  }

  setDraggableObjects(objects) {
    this.draggableObjects = objects;
  }

  update() {
    if (this.selectedObject && this.activeController && this.isXRSessionActive) {
      if (this.rotationMode) {
        const currentControllerQuaternion = this.activeController.quaternion;
        const deltaQuaternion = currentControllerQuaternion.clone();
        deltaQuaternion.multiply(this.startControllerQuaternion.clone().invert());
        const newObjectQuaternion = deltaQuaternion.multiply(this.startObjectQuaternion);
        this.selectedObject.quaternion.copy(newObjectQuaternion);
      } else {
        const currentPosition = new THREE.Vector3();
        currentPosition.setFromMatrixPosition(this.activeController.matrixWorld);
        let delta = new THREE.Vector3().subVectors(currentPosition, this.lastControllerPosition);
        
        if (navigator.userAgent.match(/Mobi/)) {
          delta.multiplyScalar(2.0);
        }
        
        this.selectedObject.position.add(delta);
        this.lastControllerPosition.copy(currentPosition);
      }
    }
    
    if (this.orbitControls && !this.isXRSessionActive) {
      this.orbitControls.update();
    }
  }
  
  onXRSessionStart() {
    this.isXRSessionActive = true;
    console.log("XR session started from interaction manager");
  }
  
  onXRSessionEnd() {
    this.isXRSessionActive = false;
    console.log("XR session ended from interaction manager");
  }
}