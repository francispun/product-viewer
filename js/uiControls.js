// uiControls.js

import * as THREE from 'three';
import { ARButton } from 'https://unpkg.com/three@0.141.0/examples/jsm/webxr/ARButton.js';
import { showConfirmationModal } from './modalManager.js';

function shouldUseCompactUI() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmallWindow = window.innerWidth < 768;
  return isMobile || isSmallWindow;
}

function updateButtonForCompactUI(button, iconClass, tooltip) {
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.title = tooltip;
  button.style.fontSize = 'larger';
  button.style.padding = '20px';
  button.style.minWidth = 'unset';
  button.style.width = '42px';
  button.style.height = '42px';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
}

function getMaterialsByName(app) {
  const materialMap = new Map();
  if (!app.productGroup) return materialMap;
  app.loadedModels.forEach((modelGroup, modelName) => {
    modelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        let materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          const matName = material.name || material.uuid;
          const fullName = `${matName.charAt(0).toUpperCase() + matName.slice(1)} - ${modelName}`;
          if (!material.userData.originalColor) {
            material.userData.originalColor = '#' + material.color.getHexString();
          }
          materialMap.set(fullName, {
            model: modelName,
            mesh: child,
            material: material
          });
        });
      }
    });
  });
  return materialMap;
}

function showMaterialColorPicker(app) {
  const materialMap = getMaterialsByName(app);
  if (materialMap.size === 0) {
    alert('No colorable parts found in the current model.');
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '10000';
  
  const modal = document.createElement('div');
  modal.style.backgroundColor = 'white';
  modal.style.padding = '20px';
  modal.style.borderRadius = '8px';
  modal.style.width = '300px';
  
  const heading = document.createElement('h3');
  heading.textContent = 'Select Part to Color';
  heading.style.marginTop = '0';
  
  const materialSelect = document.createElement('select');
  materialSelect.style.width = '100%';
  materialSelect.style.padding = '8px';
  materialSelect.style.margin = '15px 0px';
  materialSelect.style.borderRadius = '4px';
  materialSelect.style.border = '1px solid #ccc';
  
  materialMap.forEach((value, key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    materialSelect.appendChild(option);
  });
  
  const colorPickerWrapper = document.createElement('div');
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.style.padding = 'revert';
  colorInput.value = '#ff0000';
  colorInput.style.marginBottom = '15px';
  
  const recentColorsHeading = document.createElement('h4');
  recentColorsHeading.textContent = 'Colors';
  recentColorsHeading.style.marginBottom = '10px';
  
  const recentColorsDiv = document.createElement('div');
  recentColorsDiv.style.display = 'flex';
  recentColorsDiv.style.flexWrap = 'wrap';
  recentColorsDiv.style.gap = '8px';
  recentColorsDiv.style.marginBottom = '15px';
  
  function updateRecentColorsUI() {
    recentColorsDiv.innerHTML = '';
    
    const selectedMaterialKey = materialSelect.value;
    const materialData = materialMap.get(selectedMaterialKey);
    const originalColor = materialData?.material?.userData?.originalColor;
    
    if (originalColor) {
      const originalColorWrapper = document.createElement('div');
      originalColorWrapper.style.display = 'flex';
      originalColorWrapper.style.flexDirection = 'column';
      originalColorWrapper.style.alignItems = 'center';
      
      const originalColorBtn = document.createElement('button');
      originalColorBtn.style.width = '30px';
      originalColorBtn.style.height = '30px';
      originalColorBtn.style.backgroundColor = originalColor;
      originalColorBtn.style.border = '1px solid #ccc';
      originalColorBtn.style.borderRadius = '4px';
      originalColorBtn.style.cursor = 'pointer';
      
      const label = document.createElement('span');
      label.textContent = 'Original';
      label.style.fontSize = '10px';
      label.style.marginTop = '2px';
      
      originalColorBtn.addEventListener('click', () => {
        colorInput.value = originalColor;
      });
      
      originalColorWrapper.appendChild(originalColorBtn);
      originalColorWrapper.appendChild(label);
      recentColorsDiv.appendChild(originalColorWrapper);
    }
    
    const recentColors = getRecentColors();
    recentColors.forEach(color => {
      const colorBtn = document.createElement('button');
      colorBtn.style.width = '30px';
      colorBtn.style.height = '30px';
      colorBtn.style.backgroundColor = color;
      colorBtn.style.border = '1px solid #ccc';
      colorBtn.style.borderRadius = '4px';
      colorBtn.style.cursor = 'pointer';
      
      colorBtn.addEventListener('click', () => {
        colorInput.value = color;
      });
      
      recentColorsDiv.appendChild(colorBtn);
    });
  }
  
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.display = 'flex';
  buttonsDiv.style.justifyContent = 'space-between';
  
  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.style.backgroundColor = '#d00024';
  applyBtn.style.color = 'white';
  applyBtn.style.border = 'none';
  applyBtn.style.borderRadius = '9999px';
  applyBtn.style.padding = '8px 24px';
  applyBtn.style.cursor = 'pointer';
  
  applyBtn.addEventListener('click', () => {
    const selectedMaterialKey = materialSelect.value;
    const colorValue = colorInput.value;
    applyColorToMaterial(app, materialMap, selectedMaterialKey, colorValue);
    addRecentColor(colorValue);
    document.body.removeChild(overlay);
  });
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.backgroundColor = '#999';
  cancelBtn.style.color = 'white';
  cancelBtn.style.border = 'none';
  cancelBtn.style.borderRadius = '9999px';
  cancelBtn.style.padding = '8px 24px';
  cancelBtn.style.cursor = 'pointer';
  
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  buttonsDiv.appendChild(cancelBtn);
  buttonsDiv.appendChild(applyBtn);
  
  colorPickerWrapper.appendChild(colorInput);
  
  modal.appendChild(heading);
  modal.appendChild(materialSelect);
  modal.appendChild(colorPickerWrapper);
  modal.appendChild(recentColorsHeading);
  modal.appendChild(recentColorsDiv);
  modal.appendChild(buttonsDiv);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput);
  updateRecentColorsUI();
  
  materialSelect.addEventListener('change', () => {
    updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput);
    updateRecentColorsUI();
  });
}

function updateColorFromSelectedMaterial(materialMap, materialSelect, colorInput) {
  const selectedMaterialKey = materialSelect.value;
  const materialData = materialMap.get(selectedMaterialKey);
  if (materialData && materialData.material && materialData.material.color) {
    const color = '#' + materialData.material.color.getHexString();
    colorInput.value = color;
  }
}

function applyColorToMaterial(app, materialMap, materialKey, colorValue) {
  const materialData = materialMap.get(materialKey);
  if (materialData && materialData.material) {
    const color = new THREE.Color(colorValue);
    materialData.material.color.set(color);
  }
}

function getRecentColors() {
  try {
    const storedColors = localStorage.getItem('recentColors');
    return storedColors ? JSON.parse(storedColors) : [];
  } catch (e) {
    console.error('Error loading recent colors:', e);
    return [];
  }
}

function addRecentColor(color) {
  try {
    let recentColors = getRecentColors();
    recentColors = recentColors.filter(c => c !== color);
    recentColors.unshift(color);
    recentColors = recentColors.slice(0, 6);
    localStorage.setItem('recentColors', JSON.stringify(recentColors));
  } catch (e) {
    console.error('Error saving recent colors:', e);
  }
}

function createColorButton(app) {
  const colorButton = document.createElement('button');
  const useCompactUI = shouldUseCompactUI();
  
  if (useCompactUI) {
    updateButtonForCompactUI(colorButton, "fa-solid fa-palette", "Change Color");
  } else {
    colorButton.textContent = 'Color';
  }
  
  colorButton.style.padding = useCompactUI ? '25px' : '8px 24px';
  colorButton.style.border = 'none';
  colorButton.style.outline = 'none';
  colorButton.style.borderRadius = '9999px';
  colorButton.style.backgroundColor = '#d00024';
  colorButton.style.color = 'white';
  colorButton.style.cursor = 'pointer';
  colorButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  colorButton.addEventListener('mouseover', () => {
    colorButton.style.backgroundColor = '#b0001d';
  });
  colorButton.addEventListener('mouseout', () => {
    colorButton.style.backgroundColor = '#d00024';
  });
  
  colorButton.addEventListener('click', () => {
    showMaterialColorPicker(app);
  });
  
  return colorButton;
}

export function setupUIControls(app) {
  // Create a container for the controls.
  const controlsContainer = document.createElement('div');
  controlsContainer.style.position = 'fixed';
  controlsContainer.style.top = '10px';
  controlsContainer.style.left = '10px';
  controlsContainer.style.zIndex = '1000';
  controlsContainer.style.display = 'flex';
  controlsContainer.style.alignItems = 'center';
  controlsContainer.style.gap = shouldUseCompactUI() ? '5px' : '10px';

  // Create the Upload button.
  const uploadButton = document.createElement('button');
  if (shouldUseCompactUI()) {
    updateButtonForCompactUI(uploadButton, "fa-solid fa-file-arrow-up", "Upload Model");
  } else {
    uploadButton.textContent = 'Upload';
  }
  uploadButton.style.padding = shouldUseCompactUI() ? '25px' : '8px 24px';
  uploadButton.style.border = 'none';
  uploadButton.style.outline = 'none';
  uploadButton.style.borderRadius = '9999px';
  uploadButton.style.backgroundColor = '#d00024';
  uploadButton.style.color = 'white';
  uploadButton.style.cursor = 'pointer';
  uploadButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  uploadButton.addEventListener('mouseover', () => {
    uploadButton.style.backgroundColor = '#b0001d';
  });
  uploadButton.addEventListener('mouseout', () => {
    uploadButton.style.backgroundColor = '#d00024';
  });
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.glb,.gltf';
  fileInput.style.display = 'none';
  fileInput.multiple = true;
  fileInput.onchange = async (event) => {
    app.clearExistingModels();
    const files = event.target.files;
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
          const name = data.name.replace('.glb', '').replace('.gltf', '');
          app.loadModel(data.url, name);
        } else {
          console.error("Upload failed:", response.statusText);
        }
      } catch (error) {
        console.error("File upload error:", error);
      }
    }
  };
  
  uploadButton.onclick = () => fileInput.click();
  
  // Create the Browse button.
  const browseButton = document.createElement('button');
  if (shouldUseCompactUI()) {
    updateButtonForCompactUI(browseButton, "fa-solid fa-folder-open", "Browse Models");
  } else {
    browseButton.textContent = 'Browse';
  }
  browseButton.style.padding = shouldUseCompactUI() ? '25px' : '8px 24px';
  browseButton.style.border = 'none';
  browseButton.style.outline = 'none';
  browseButton.style.borderRadius = '9999px';
  browseButton.style.backgroundColor = '#d00024';
  browseButton.style.color = 'white';
  browseButton.style.cursor = 'pointer';
  browseButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';

  browseButton.addEventListener('mouseover', () => {
    browseButton.style.backgroundColor = '#b0001d';
  });
  browseButton.addEventListener('mouseout', () => {
    browseButton.style.backgroundColor = '#d00024';
  });

  browseButton.addEventListener('click', () => {
    if (app.showBrowseInterface) {
      app.showBrowseInterface();
    } else {
      console.log("Browse interface is not available.");
    }
  });
  
  // Create the Color button.
  const colorButton = createColorButton(app);
  
  // Create the Reset button.
  const resetButton = document.createElement('button');
  if (shouldUseCompactUI()) {
    updateButtonForCompactUI(resetButton, "fa-solid fa-arrows-rotate", "Reset Model");
  } else {
    resetButton.textContent = 'Reset';
  }
  resetButton.style.padding = shouldUseCompactUI() ? '25px' : '8px 24px';
  resetButton.style.border = 'none';
  resetButton.style.outline = 'none';
  resetButton.style.borderRadius = '9999px';
  resetButton.style.backgroundColor = '#d00024';
  resetButton.style.color = 'white';
  resetButton.style.cursor = 'pointer';
  resetButton.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  resetButton.addEventListener('mouseover', () => {
    resetButton.style.backgroundColor = '#b0001d';
  });
  resetButton.addEventListener('mouseout', () => {
    resetButton.style.backgroundColor = '#d00024';
  });
  
  resetButton.onclick = () => {
    if (app.productGroup) {
      app.productGroup.children.forEach((child) => {
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        if (child.children.length > 0 && child.children[0].userData.originalScale) {
          child.scale.copy(child.children[0].userData.originalScale);
        } else {
          child.scale.set(1, 1, 1);
        }
      });
    }
    if (typeof app.fitCameraToScene === 'function') {
      app.fitCameraToScene();
    }
  };
  
  controlsContainer.appendChild(fileInput);
  controlsContainer.appendChild(browseButton);
  controlsContainer.appendChild(colorButton);
  controlsContainer.appendChild(resetButton);

  // Optional: AR Button (if supported).
  if ('xr' in navigator) {
    const arButton = ARButton.createButton(app.renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    arButton.style.position = 'fixed';
    controlsContainer.appendChild(arButton);
  
    app.renderer.xr.addEventListener('sessionstart', () => {
      console.log("AR session started");
      app.isARMode = true;
      app.scene.background = null;
      app.renderer.setClearColor(0x000000, 0);
    });
    app.renderer.xr.addEventListener('sessionend', () => {
      console.log("AR session ended");
      app.isARMode = false;
      app.scene.background = new THREE.Color(0xcccccc);
      app.renderer.setClearColor(0xcccccc, 1);
    });
  }
  
  document.body.appendChild(controlsContainer);
}

export function updateToggleUI(app, viewerButton, hostButton, isHost) {
  // No longer needed as host functionality is removed.
}