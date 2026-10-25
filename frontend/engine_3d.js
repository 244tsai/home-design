// 建構具手腳關節軸心的 3D 擬真人物：
// 坐姿修正：雙腳鞋底永遠踩在地面 (y = 0，絕不穿模入地)，臀部底面精準貼齊 seat_h (床高或椅子坐墊高)！
function buildRealistic3DHuman(hData) {
  const group = new THREE.Group();
  const stature = hData.height || 178;
  const s = stature / 175;
  const posture = hData.posture || "stand";

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xFFDCB1 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x1E293B });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3B82F6 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1E293B });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0xF8FAFC });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0F172A });

  const rig = new THREE.Group();

  const headGroup = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(10.5 * s, 20, 20), skinMat);
  headGroup.add(headMesh);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(11 * s, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hairMesh.position.y = 1.5 * s;
  headGroup.add(hairMesh);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 8, 8), eyeMat);
  eyeL.position.set(-3.6 * s, 1 * s, -9.8 * s);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 8, 8), eyeMat);
  eyeR.position.set(3.6 * s, 1 * s, -9.8 * s);
  headGroup.add(eyeL, eyeR);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(4 * s, 4.5 * s, 8 * s, 12), skinMat);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(32 * s, 50 * s, 17 * s), shirtMat);
  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(30 * s, 14 * s, 16 * s), pantsMat);

  if (posture === "stand") {
    headGroup.position.set(0, 158 * s, 0);
    neckMesh.position.set(0, 145 * s, 0);
    torsoMesh.position.set(0, 118 * s, 0);
    pelvisMesh.position.set(0, 86 * s, 0);

    const armGeo = new THREE.CylinderGeometry(4.2 * s, 3.5 * s, 52 * s, 12);
    const armLPivot = new THREE.Group();
    armLPivot.position.set(-20 * s, 140 * s, 0);
    const armLMesh = new THREE.Mesh(armGeo, shirtMat);
    armLMesh.position.y = -26 * s;
    armLPivot.add(armLMesh);

    const armRPivot = new THREE.Group();
    armRPivot.position.set(20 * s, 140 * s, 0);
    const armRMesh = new THREE.Mesh(armGeo, shirtMat);
    armRMesh.position.y = -26 * s;
    armRPivot.add(armRMesh);

    const legGeo = new THREE.CylinderGeometry(6 * s, 4.5 * s, 74 * s, 12);
    const shoeGeo = new THREE.BoxGeometry(10 * s, 7 * s, 22 * s);

    const legLPivot = new THREE.Group();
    legLPivot.position.set(-8.5 * s, 80 * s, 0);
    const legLMesh = new THREE.Mesh(legGeo, pantsMat);
    legLMesh.position.y = -37 * s;
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(0, -76.5 * s, -4 * s);
    legLPivot.add(legLMesh, shoeL);

    const legRPivot = new THREE.Group();
    legRPivot.position.set(8.5 * s, 80 * s, 0);
    const legRMesh = new THREE.Mesh(legGeo, pantsMat);
    legRMesh.position.y = -37 * s;
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0, -76.5 * s, -4 * s);
    legRPivot.add(legRMesh, shoeR);

    rig.add(headGroup, neckMesh, torsoMesh, pelvisMesh, armLPivot, armRPivot, legLPivot, legRPivot);
    group.userData.limbs = { armL: armLPivot, armR: armRPivot, legL: legLPivot, legR: legRPivot };

  } else if (posture === "sit") {
    // 坐姿：雙腳鞋底永遠著地 (y = 0)，臀部底面精準貼齊座高 seatH (床高 55cm 或椅子坐墊高)
    const seatH = Math.max(25, hData.seat_h || 45);
    const shoeH = 7 * s;

    // 雙腳平踏於地面 (y = shoeH / 2)
    const shoeGeo = new THREE.BoxGeometry(10 * s, shoeH, 22 * s);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-8.5 * s, shoeH / 2, -28 * s);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(8.5 * s, shoeH / 2, -28 * s);

    // 小腿由腳踝 (shoeH) 垂直連接至座高 (seatH)
    const calfLen = Math.max(12, seatH - shoeH);
    const calfGeo = new THREE.CylinderGeometry(5 * s, 4 * s, calfLen, 12);
    const calfL = new THREE.Mesh(calfGeo, pantsMat);
    calfL.position.set(-8.5 * s, shoeH + calfLen / 2, -24 * s);
    const calfR = new THREE.Mesh(calfGeo, pantsMat);
    calfR.position.set(8.5 * s, shoeH + calfLen / 2, -24 * s);

    // 水平大腿與臀部底面貼齊 seatH
    const thighGeo = new THREE.BoxGeometry(11 * s, 11 * s, 32 * s);
    const thighL = new THREE.Mesh(thighGeo, pantsMat);
    thighL.position.set(-8.5 * s, seatH + 5.5 * s, -12 * s);
    const thighR = new THREE.Mesh(thighGeo, pantsMat);
    thighR.position.set(8.5 * s, seatH + 5.5 * s, -12 * s);

    pelvisMesh.position.set(0, seatH + 7 * s, 0);
    torsoMesh.position.set(0, seatH + 37 * s, 0);
    neckMesh.position.set(0, seatH + 65 * s, 0);
    headGroup.position.set(0, seatH + 77 * s, 0);

    const armGeo = new THREE.CylinderGeometry(4.2 * s, 3.5 * s, 48 * s, 12);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-20 * s, seatH + 37 * s, -6 * s);
    armL.rotation.x = 0.35;
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(20 * s, seatH + 37 * s, -6 * s);
    armR.rotation.x = 0.35;

    rig.add(headGroup, neckMesh, torsoMesh, pelvisMesh, armL, armR, thighL, thighR, calfL, calfR, shoeL, shoeR);

  } else {
    headGroup.position.set(0, 18 * s, 52 * s);
    headGroup.rotation.x = Math.PI / 2.3;
    neckMesh.position.set(0, 12 * s, 38 * s);
    neckMesh.rotation.x = Math.PI / 2;
    torsoMesh.position.set(0, 10 * s, 8 * s);
    torsoMesh.rotation.x = Math.PI / 2;
    pelvisMesh.position.set(0, 9 * s, -22 * s);
    pelvisMesh.rotation.x = Math.PI / 2;

    const armGeo = new THREE.CylinderGeometry(4.2 * s, 3.5 * s, 52 * s, 12);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-21 * s, 9 * s, 8 * s);
    armL.rotation.x = Math.PI / 2;
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(21 * s, 9 * s, 8 * s);
    armR.rotation.x = Math.PI / 2;

    const legGeo = new THREE.CylinderGeometry(5.8 * s, 4.5 * s, 70 * s, 12);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.rotation.x = Math.PI / 2;
    legL.position.set(-8.5 * s, 8 * s, -62 * s);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.rotation.x = Math.PI / 2;
    legR.position.set(8.5 * s, 8 * s, -62 * s);

    rig.add(headGroup, neckMesh, torsoMesh, pelvisMesh, armL, armR, legL, legR);
  }

  // 坐下時整個 group 的腳底基準在地面 0；站立或躺床時則在 hData.z
  const groupBaseY = (posture === "sit") ? 0 : (hData.z || 0);
  const eyeLocalY = getHumanEyeHeight() - groupBaseY;
  const coneGeo = new THREE.ConeGeometry(11, 38, 12);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMesh = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xA855F7, wireframe: true }));
  coneMesh.position.set(0, eyeLocalY, -28);
  rig.add(coneMesh);

  group.add(rig);
  group.position.set(hData.x, groupBaseY, hData.y);
  group.rotation.y = -(hData.rot || 0) * Math.PI / 180;
  group.userData.isHuman = true;
  return group;
}

function updateHumanWalkAnimation(isMoving) {
  if (!human3DGroup || !human3DGroup.userData.limbs) return;
  const limbs = human3DGroup.userData.limbs;
  if (isMoving) {
    const swing = Math.sin(Date.now() * 0.008) * 0.52;
    limbs.armL.rotation.x = swing;
    limbs.armR.rotation.x = -swing;
    limbs.legL.rotation.x = -swing * 0.85;
    limbs.legR.rotation.x = swing * 0.85;
  } else {
    limbs.armL.rotation.x *= 0.75;
    limbs.armR.rotation.x *= 0.75;
    limbs.legL.rotation.x *= 0.75;
    limbs.legR.rotation.x *= 0.75;
  }
}

// 讀取左側第一人稱可編輯的視野角度 (預設左右 100度、上 50度、下 65度) 建立非對稱透視投影矩陣
function applyCameraProjection() {
  if (!camera) return;
  const container = document.getElementById("three-container");
  const w = Math.max(1, container.clientWidth);
  const h = Math.max(1, container.clientHeight);
  camera.aspect = w / h;

  if (currentMode === "FPV") {
    const near = 2;
    const far = 6000;
    const fovH = appState.human.fov_h || 100;
    const fovUp = appState.human.fov_up || 50;
    const fovDown = appState.human.fov_down || 65;

    const halfHoriz = Math.tan((fovH / 2) * Math.PI / 180) * near;
    const left = -halfHoriz;
    const right = halfHoriz;
    const top = Math.tan(fovUp * Math.PI / 180) * near;
    const bottom = -Math.tan(fovDown * Math.PI / 180) * near;
    camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    if (camera.projectionMatrixInverse) {
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
  } else {
    camera.fov = 65;
    camera.near = 2;
    camera.far = 6000;
    camera.updateProjectionMatrix();
  }
}

function attachGizmoWithRules(mesh) {
  if (!transformControl || !mesh) return;
  transformControl.attach(mesh);

  if (mesh.userData.isHuman) {
    if (gizmoMode === "scale") transformControl.setMode("translate");
    else transformControl.setMode(gizmoMode);
    transformControl.showY = (transformControl.getMode() === "rotate");
    transformControl.showX = (transformControl.getMode() !== "rotate");
    transformControl.showZ = (transformControl.getMode() !== "rotate");
    return;
  }

  const item = appState.items.find(i => i.id === mesh.userData.itemId);
  const t = item ? (item.item_type || "furniture") : "furniture";

  if (gizmoMode === "scale" && appState.room.lock_scale) {
    showToast("🔒 已鎖定既有物品縮放！");
    transformControl.setMode("translate");
  } else {
    transformControl.setMode(gizmoMode);
  }

  const curM = transformControl.getMode();
  if (curM === "translate") {
    transformControl.showX = true;
    transformControl.showZ = true;
    transformControl.showY = isZAdjustableWallType(t);
  } else if (curM === "rotate") {
    transformControl.showX = false;
    transformControl.showZ = false;
    transformControl.showY = true;
  } else {
    transformControl.showX = true;
    transformControl.showY = true;
    transformControl.showZ = true;
  }
}

function initThree() {
  const container = document.getElementById("three-container");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0B0F17);

  camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 2, 6000);
  camera.position.set(appState.room.width / 2, 420, appState.room.depth + 340);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(appState.room.width / 2, 60, appState.room.depth / 2);

  transformControl = new THREE.TransformControls(camera, renderer.domElement);
  transformControl.addEventListener('dragging-changed', function(event) {
    if (currentMode === "3D") controls.enabled = !event.value;
    const trashEl = document.getElementById("trash-dropzone");
    if (event.value && activeId && activeId !== "HUMAN") {
      trashEl.classList.add("show");
    } else {
      if (isOverTrash && activeId && activeId !== "HUMAN") {
        deleteItemById(activeId);
        trashEl.classList.remove("show", "hover");
        isOverTrash = false;
        return;
      }
      trashEl.classList.remove("show", "hover");
      isOverTrash = false;

      if (!event.value && activeId && activeId !== "HUMAN") {
        renderFullScene();
      }
    }
  });

  transformControl.addEventListener('change', function() {
    if (!transformControl.object || !transformControl.dragging) return;
    const obj = transformControl.object;

    if (obj.userData.isHuman) {
      obj.scale.set(1, 1, 1);
      const nx = Math.round(obj.position.x);
      const ny = Math.round(obj.position.z);
      tryMoveHumanTo(nx, ny, false);
      const groupBaseY = (appState.human.posture === "sit") ? 0 : (appState.human.z || 0);
      obj.position.set(appState.human.x, groupBaseY, appState.human.y);
      appState.human.rot = Math.round((-obj.rotation.y * 180 / Math.PI % 360 + 360) % 360);
      initHumanFormValues();

    } else if (obj.userData.itemId) {
      const item = appState.items.find(i => i.id === obj.userData.itemId);
      if (!item) return;

      const curM = transformControl.getMode();
      let mode = "move";
      if (curM === "scale" && !appState.room.lock_scale) {
        mode = "scale";
        item.w = Math.max(5, Math.round(obj.userData.origW * Math.abs(obj.scale.x)));
        item.h = Math.max(5, Math.min(appState.room.height, Math.round(obj.userData.origH * Math.abs(obj.scale.y))));
        item.d = Math.max(5, Math.round(obj.userData.origD * Math.abs(obj.scale.z)));
      } else if (curM === "rotate") {
        mode = "rotate";
      }

      item.x = Math.round(obj.position.x - item.w / 2);
      item.y = Math.round(obj.position.z - item.d / 2);
      if (isZAdjustableWallType(item.item_type)) {
        item.z = Math.max(0, Math.min(appState.room.height - (item.h || 30), Math.round(obj.position.y - (item.h || 30) / 2)));
      } else {
        item.z = 0;
      }
      item.rot = Math.round((-obj.rotation.y * 180 / Math.PI % 360 + 360) % 360);

      enforceItemConstraints(item, mode, false);

      const h = item.h || 30;
      const zBottom = item.z || 0;
      obj.position.set(item.x + item.w / 2, zBottom + h / 2, item.y + item.d / 2);
      obj.rotation.y = -(item.rot || 0) * Math.PI / 180;
      if (mode === "scale") {
        obj.scale.set(item.w / obj.userData.origW, h / obj.userData.origH, item.d / obj.userData.origD);
      }

      updateLeftItemPanel();
      renderRightPanel();
    }
  });
  scene.add(transformControl);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downX = 0, downY = 0, downTime = 0;

  renderer.domElement.addEventListener('pointerdown', function(e) {
    downX = e.clientX; downY = e.clientY; downTime = Date.now();
    if (currentMode === "FPV") {
      isLookingFPV = true;
      fpvLastX = e.clientX;
      fpvLastY = e.clientY;
    }
  });

  renderer.domElement.addEventListener('pointermove', function(e) {
    if (transformControl && transformControl.dragging) {
      const trashEl = document.getElementById("trash-dropzone");
      const rect = trashEl.getBoundingClientRect();
      isOverTrash = (e.clientX >= rect.left - 20 && e.clientX <= rect.right + 20 && e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20);
      trashEl.classList.toggle("hover", isOverTrash);
    }
    if (currentMode === "FPV" && isLookingFPV) {
      const dx = e.clientX - fpvLastX;
      const dy = e.clientY - fpvLastY;
      fpvLastX = e.clientX;
      fpvLastY = e.clientY;
      appState.human.rot = ((appState.human.rot + dx * 0.32) % 360 + 360) % 360;
      if (!appState.human.lock_horizontal) {
        const maxUp = appState.human.fov_up || 50;
        const maxDown = -(appState.human.fov_down || 65);
        appState.human.pitch = Math.max(maxDown, Math.min(maxUp, (appState.human.pitch || 0) - dy * 0.32));
      }
      initHumanFormValues();
      syncFPVCamera();
    }
  });

  renderer.domElement.addEventListener('pointerup', function(e) {
    isLookingFPV = false;
    const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
    const elapsed = Date.now() - downTime;
    if (moveDist > 8 || elapsed > 500) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (currentMode === "FPV") {
      const walkHits = raycaster.intersectObjects(walkable3DMeshes, true);
      if (walkHits.length > 0) {
        const pt = walkHits[0].point;
        triggerWalkToTarget(pt.x, pt.z);
      } else {
        const yawRad = (appState.human.rot || 0) * Math.PI / 180;
        triggerWalkToTarget(appState.human.x + Math.sin(yawRad) * 55, appState.human.y - Math.cos(yawRad) * 55);
      }
      return;
    }

    if (currentMode === "3D") {
      const intersects = raycaster.intersectObjects(selectable3DMeshes, true);
      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit.parent && !hit.userData.itemId && !hit.userData.isHuman) {
          hit = hit.parent;
        }
        if (hit.userData.isHuman) {
          activeId = "HUMAN";
          attachGizmoWithRules(hit);
          switchLeftTab('human');
          initHumanFormValues();
          return;
        } else if (hit.userData.itemId) {
          const hitItem = appState.items.find(i => i.id === hit.userData.itemId);
          if (activeId === "HUMAN" && hitItem && isBedItem(hitItem)) {
            const pt = intersects[0].point;
            triggerWalkToTarget(pt.x, pt.z);
            return;
          }
          activeId = hit.userData.itemId;
          attachGizmoWithRules(hit);
          switchLeftTab('item');
          updateLeftItemPanel();
          highlightRightPanel();
          return;
        }
      }

      const floorHits = raycaster.intersectObjects(walkable3DMeshes, true);
      if (floorHits.length > 0) {
        const pt = floorHits[0].point;
        triggerWalkToTarget(pt.x, pt.z);
      } else if (!transformControl.dragging) {
        transformControl.detach();
      }
    }
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
  dirLight.position.set(250, 520, 320);
  scene.add(dirLight);

  animateThree();
}

function triggerWalkToTarget(tx, ty) {
  walkTarget = { x: tx, y: ty };
  const dx = tx - appState.human.x;
  const dy = ty - appState.human.y;
  if (Math.hypot(dx, dy) > 2) {
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    appState.human.rot = Math.round((deg % 360 + 360) % 360);
  }
  if (targetRingMesh) {
    const check = checkHumanWalkable(tx, ty);
    targetRingMesh.position.set(tx, (check.baseZ || 0) + 1.5, ty);
    targetRingMesh.visible = true;
  }
}

window.set3DGizmoMode = function(mode) {
  if (mode === "scale" && appState.room.lock_scale) {
    showToast("🔒 已鎖定既有物品縮放，請先解除鎖定！");
    return;
  }
  gizmoMode = mode;
  document.getElementById("btn-3d-translate").classList.toggle("active", mode === "translate");
  document.getElementById("btn-3d-rotate").classList.toggle("active", mode === "rotate");
  document.getElementById("btn-3d-scale").classList.toggle("active", mode === "scale");
  if (transformControl && transformControl.object) {
    attachGizmoWithRules(transformControl.object);
  }
};

function updateThreeScene() {
  if (!scene) return;
  if (transformControl) transformControl.detach();
  selectable3DMeshes = [];
  walkable3DMeshes = [];

  const keep = [scene.children[0], scene.children[1], transformControl];
  scene.children = keep.filter(Boolean);

  const rw = appState.room.width, rd = appState.room.depth, rh = appState.room.height;
  const texLoader = new THREE.TextureLoader();

  const floorGeo = new THREE.PlaneGeometry(rw, rd);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x5089C6, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(rw / 2, 0, rd / 2);
  scene.add(floor);
  walkable3DMeshes.push(floor);

  const ringGeo = new THREE.RingGeometry(8, 13, 24);
  ringGeo.rotateX(-Math.PI / 2);
  targetRingMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x38BDF8, side: THREE.DoubleSide }));
  targetRingMesh.visible = !!walkTarget;
  if (walkTarget) targetRingMesh.position.set(walkTarget.x, (appState.human.z || 0) + 1.5, walkTarget.y);
  scene.add(targetRingMesh);

  if (appState.room.show_walls) {
    let wallMat;
    if (appState.room.wall_texture) {
      wallMat = new THREE.MeshLambertMaterial({ map: texLoader.load(appState.room.wall_texture), side: THREE.DoubleSide });
    } else {
      wallMat = new THREE.MeshLambertMaterial({
        color: appState.room.wall_color || "#F8FAFC",
        side: THREE.DoubleSide,
        transparent: currentMode === "3D",
        opacity: currentMode === "3D" ? 0.52 : 1.0
      });
    }
    const wNorth = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), wallMat);
    wNorth.position.set(rw / 2, rh / 2, 0);
    const wSouth = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), wallMat);
    wSouth.position.set(rw / 2, rh / 2, rd);
    const wWest = new THREE.Mesh(new THREE.PlaneGeometry(rd, rh), wallMat);
    wWest.rotation.y = Math.PI / 2;
    wWest.position.set(0, rh / 2, rd / 2);
    const wEast = new THREE.Mesh(new THREE.PlaneGeometry(rd, rh), wallMat);
    wEast.rotation.y = Math.PI / 2;
    wEast.position.set(rw, rh / 2, rd / 2);
    scene.add(wNorth, wSouth, wWest, wEast);
  }

  if (appState.room.show_ceiling) {
    let ceilMat;
    if (appState.room.ceiling_texture) {
      ceilMat = new THREE.MeshLambertMaterial({ map: texLoader.load(appState.room.ceiling_texture), side: THREE.DoubleSide });
    } else {
      ceilMat = new THREE.MeshLambertMaterial({ color: appState.room.ceiling_color || "#FFFFFF", side: THREE.DoubleSide });
    }
    const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(rw / 2, rh, rd / 2);
    scene.add(ceilMesh);
  }

  const wallLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, rh, rd)), new THREE.LineBasicMaterial({ color: 0x475569 }));
  wallLine.position.set(rw / 2, rh / 2, rd / 2);
  scene.add(wallLine);

  appState.voids.forEach(v => {
    const voidMesh = new THREE.Mesh(new THREE.PlaneGeometry(v.w, v.d), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    voidMesh.rotation.x = -Math.PI / 2;
    voidMesh.position.set(v.x + v.w / 2, 0.4, v.y + v.d / 2);
    scene.add(voidMesh);
  });

  if (currentMode === "3D") {
    human3DGroup = buildRealistic3DHuman(appState.human);
    scene.add(human3DGroup);
    selectable3DMeshes.push(human3DGroup);
    if (activeId === "HUMAN") attachGizmoWithRules(human3DGroup);
  } else {
    human3DGroup = null;
  }

  appState.items.forEach(item => {
    const h = item.h || 30;
    const zBottom = item.z || 0;
    const t = item.item_type || "furniture";
    let itemMesh;

    const isEastWestWall = (item.wall === "west" || item.wall === "east") || (item.d > item.w && isZAdjustableWallType(t));
    const faceW = isEastWestWall ? item.d : item.w;
    const thickD = isEastWestWall ? item.w : item.d;

    if (t === "chair") {
      // 🪑 3D 擬真椅子渲染：四根椅腳 + 坐墊(依設定之坐墊高度 seat_h 定位) + 椅背
      itemMesh = new THREE.Group();
      const seatH = Math.max(15, Math.min(h - 5, item.seat_h || 45));
      const seatThick = 5;
      const mat = item.texture ? new THREE.MeshLambertMaterial({ map: texLoader.load(item.texture) }) : new THREE.MeshLambertMaterial({ color: item.color });
      const legMat = new THREE.MeshLambertMaterial({ color: 0x334155 });

      // 坐墊平面 (頂面高度恰為 seatH，相對中心偏移為 seatH - h/2)
      const seatGeo = new THREE.BoxGeometry(item.w, seatThick, item.d);
      const seatMesh = new THREE.Mesh(seatGeo, mat);
      seatMesh.position.y = -h / 2 + seatH - seatThick / 2;
      seatMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(seatGeo), new THREE.LineBasicMaterial({ color: 0x1E293B })));
      itemMesh.add(seatMesh);

      // 椅背 (由坐墊向上延伸至總高度 h，位於椅子後方 +Z)
      const backH = Math.max(5, h - seatH);
      const backThick = Math.max(4, item.d * 0.12);
      const backGeo = new THREE.BoxGeometry(item.w, backH, backThick);
      const backMesh = new THREE.Mesh(backGeo, mat);
      backMesh.position.set(0, -h / 2 + seatH + backH / 2, item.d / 2 - backThick / 2);
      backMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(backGeo), new THREE.LineBasicMaterial({ color: 0x1E293B })));
      itemMesh.add(backMesh);

      // 四根椅腳 (由地面 0 延伸至坐墊底部)
      const legLen = Math.max(10, seatH - seatThick);
      const legGeo = new THREE.CylinderGeometry(2.2, 1.8, legLen, 10);
      const ox = item.w / 2 - 4;
      const oz = item.d / 2 - 4;
      [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, -h / 2 + legLen / 2, lz);
        itemMesh.add(leg);
      });
      itemMesh.rotation.y = -(item.rot || 0) * Math.PI / 180;

    } else if (t === "window") {
      itemMesh = new THREE.Group();
      const fDepth = Math.max(thickD, 8);
      const frameGeo = new THREE.BoxGeometry(faceW, h, fDepth);
      itemMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(frameGeo), new THREE.LineBasicMaterial({ color: 0xF59E0B, linewidth: 3 })));
      const sceneryTex = texLoader.load(item.scenery || appState.default_fuji);
      const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(4, faceW - 4), Math.max(4, h - 4), fDepth * 0.6), new THREE.MeshBasicMaterial({ map: sceneryTex }));
      itemMesh.add(glassMesh);
      if (isEastWestWall) itemMesh.rotation.y = Math.PI / 2;

    } else if (t === "socket") {
      itemMesh = new THREE.Group();
      const w = Math.max(faceW, 12), d = Math.max(thickD, 6);
      const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0xF8FAFC }));
      plateMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateMesh.geometry), new THREE.LineBasicMaterial({ color: 0x94A3B8 })));
      itemMesh.add(plateMesh);
      [-w * 0.22, w * 0.22].forEach(ox => {
        [-d/2 - 0.4, d/2 + 0.4].forEach(sz => {
          const slotMat = new THREE.MeshBasicMaterial({ color: 0x1E293B });
          const s1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.06, h * 0.22, 0.8), slotMat);
          s1.position.set(ox - w * 0.07, h * 0.1, sz);
          const s2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.06, h * 0.22, 0.8), slotMat);
          s2.position.set(ox + w * 0.07, h * 0.1, sz);
          const gnd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.08, h * 0.15, 0.8), slotMat);
          gnd.position.set(ox, -h * 0.2, sz);
          itemMesh.add(s1, s2, gnd);
        });
      });
      if (isEastWestWall) itemMesh.rotation.y = Math.PI / 2;

    } else if (t === "switch") {
      itemMesh = new THREE.Group();
      const w = Math.max(faceW, 12), d = Math.max(thickD, 6);
      const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0xF1F5F9 }));
      itemMesh.add(plateMesh);
      [-w * 0.2, w * 0.2].forEach(ox => {
        const btnMesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.65, d + 2.2), new THREE.MeshLambertMaterial({ color: 0xE2E8F0 }));
        btnMesh.rotation.x = 0.12;
        btnMesh.position.set(ox, 0, 0);
        const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, h * 0.08, d + 2.8), new THREE.MeshBasicMaterial({ color: 0x10B981 }));
        ledMesh.position.set(ox, 0, 0);
        itemMesh.add(btnMesh, ledMesh);
      });
      if (isEastWestWall) itemMesh.rotation.y = Math.PI / 2;

    } else if (t === "door") {
      itemMesh = new THREE.Group();
      const w = faceW, d = Math.max(thickD, 8);
      itemMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 6, h + 3, d + 2)), new THREE.LineBasicMaterial({ color: 0x451A03 })));
      const panelMat = item.texture ? new THREE.MeshLambertMaterial({ map: texLoader.load(item.texture) }) : new THREE.MeshLambertMaterial({ color: item.color || 0x8B5A2B });
      const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d * 0.75), panelMat);
      itemMesh.add(panelMesh);

      const handleSide = item.flip_x ? -1 : 1;
      const handleMat = new THREE.MeshLambertMaterial({ color: 0xFBBF24 });
      const handleAxis = new THREE.Mesh(new THREE.BoxGeometry(3, 3, d + 8), handleMat);
      handleAxis.position.set(handleSide * w * 0.36, -h * 0.04, 0);
      const leverF = new THREE.Mesh(new THREE.BoxGeometry(12, 2.5, 2.5), handleMat);
      leverF.position.set(handleSide * (w * 0.36 - 4), -h * 0.04, d / 2 + 3.5);
      const leverB = new THREE.Mesh(new THREE.BoxGeometry(12, 2.5, 2.5), handleMat);
      leverB.position.set(handleSide * (w * 0.36 - 4), -h * 0.04, -d / 2 - 3.5);
      itemMesh.add(handleAxis, leverF, leverB);
      if (isEastWestWall) itemMesh.rotation.y = Math.PI / 2;

    } else {
      const geo = new THREE.BoxGeometry(item.w, h, item.d);
      const mat = item.texture ? new THREE.MeshLambertMaterial({ map: texLoader.load(item.texture) }) : new THREE.MeshLambertMaterial({ color: item.color });
      itemMesh = new THREE.Mesh(geo, mat);
      itemMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: t === "wall_item" ? 0x10B981 : 0x1E293B })));
      itemMesh.rotation.y = -(item.rot || 0) * Math.PI / 180;
    }

    let posX = item.x + item.w / 2;
    let posZ = item.y + item.d / 2;
    if (isOuterWallProtrudingType(t)) {
      if (item.wall === "north") posZ = 0;
      else if (item.wall === "south") posZ = rd;
      else if (item.wall === "west") posX = 0;
      else if (item.wall === "east") posX = rw;
    }

    itemMesh.position.set(posX, zBottom + h / 2, posZ);
    itemMesh.userData = { itemId: item.id, origW: item.w, origH: h, origD: item.d };
    scene.add(itemMesh);
    selectable3DMeshes.push(itemMesh);

    if (isBedItem(item)) {
      walkable3DMeshes.push(itemMesh);
    }

    if (currentMode === "3D" && activeId === item.id) {
      attachGizmoWithRules(itemMesh);
    }
  });
}

function syncFPVCamera() {
  if (!camera) return;
  applyCameraProjection();
  const h = appState.human;
  const eyeY = getHumanEyeHeight();
  camera.position.set(h.x, eyeY, h.y);

  const yawRad = (h.rot || 0) * Math.PI / 180;
  const pitchAngle = h.lock_horizontal ? 0 : (h.pitch || 0);
  const pitchRad = pitchAngle * Math.PI / 180;

  const dirX = Math.sin(yawRad) * Math.cos(pitchRad);
  const dirY = Math.sin(pitchRad);
  const dirZ = -Math.cos(yawRad) * Math.cos(pitchRad);

  camera.lookAt(h.x + dirX * 100, eyeY + dirY * 100, h.y + dirZ * 100);
}

window.enterHumanFPV = function() {
  currentMode = "FPV";
  document.getElementById("btn-mode-fpv").classList.add("active");
  document.getElementById("btn-mode-2d").classList.remove("active");
  document.getElementById("btn-mode-3d").classList.remove("active");
  document.getElementById("canvas-container").style.display = "none";
  document.getElementById("three-container").style.display = "block";
  document.getElementById("view-controls-2d").style.display = "none";
  document.getElementById("view-controls-3d").style.display = "none";
  document.getElementById("fpv-hud").style.display = "flex";

  if (!renderer) initThree();
  controls.enabled = false;
  if (transformControl) transformControl.detach();
  const check = checkHumanWalkable(appState.human.x, appState.human.y);
  appState.human.z = check.baseZ;
  initHumanFormValues();
  updateThreeScene();
  syncFPVCamera();
};

window.exitHumanFPV = function() {
  walkTarget = null;
  document.getElementById("btn-mode-3d").click();
  renderFullScene();
};

function animateThree() {
  requestAnimationFrame(animateThree);

  let isHumanMovingNow = false;

  // 點擊走動速度再放慢 40% (2.66 * 0.6 = 1.60)
  if (walkTarget) {
    const dx = walkTarget.x - appState.human.x;
    const dy = walkTarget.y - appState.human.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.0) {
      tryMoveHumanTo(Math.round(walkTarget.x), Math.round(walkTarget.y), false);
      walkTarget = null;
      if (targetRingMesh) targetRingMesh.visible = false;
    } else {
      const step = Math.min(dist, 1.60);
      const nx = appState.human.x + (dx / dist) * step;
      const ny = appState.human.y + (dy / dist) * step;
      const moved = tryMoveHumanTo(nx, ny, true);
      if (moved) {
        isHumanMovingNow = true;
      } else {
        walkTarget = null;
        if (targetRingMesh) targetRingMesh.visible = false;
      }
    }
    if (human3DGroup) {
      const groupBaseY = (appState.human.posture === "sit") ? 0 : (appState.human.z || 0);
      human3DGroup.position.set(appState.human.x, groupBaseY, appState.human.y);
      human3DGroup.rotation.y = -(appState.human.rot || 0) * Math.PI / 180;
    }
    initHumanFormValues();
    if (currentMode === "FPV") syncFPVCamera();
  }

  // 方向鍵與搖桿移動速度再放慢 40% (2.24 * 0.6 = 1.34)
  if (fpvMoveDir.forward !== 0 || fpvMoveDir.right !== 0) {
    const speed = 1.34;
    const yawRad = (appState.human.rot || 0) * Math.PI / 180;
    const fx = Math.sin(yawRad), fz = -Math.cos(yawRad);
    const rx = Math.cos(yawRad), rz = Math.sin(yawRad);
    const nx = appState.human.x + (fx * fpvMoveDir.forward + rx * fpvMoveDir.right) * speed;
    const ny = appState.human.y + (fz * fpvMoveDir.forward + rz * fpvMoveDir.right) * speed;
    const moved = tryMoveHumanTo(nx, ny, true);
    if (moved) isHumanMovingNow = true;
    if (human3DGroup) {
      const groupBaseY = (appState.human.posture === "sit") ? 0 : (appState.human.z || 0);
      human3DGroup.position.set(appState.human.x, groupBaseY, appState.human.y);
    }
    initHumanFormValues();
    if (currentMode === "FPV") syncFPVCamera();
  }

  updateHumanWalkAnimation(isHumanMovingNow);

  if (currentMode !== "FPV" && controls && controls.enabled) {
    controls.update();
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

document.getElementById("btn-mode-2d").addEventListener("click", () => {
  currentMode = "2D";
  walkTarget = null;
  document.getElementById("btn-mode-2d").classList.add("active");
  document.getElementById("btn-mode-3d").classList.remove("active");
  document.getElementById("btn-mode-fpv").classList.remove("active");
  document.getElementById("canvas-container").style.display = "block";
  document.getElementById("three-container").style.display = "none";
  document.getElementById("view-controls-2d").style.display = "flex";
  document.getElementById("view-controls-3d").style.display = "none";
  document.getElementById("fpv-hud").style.display = "none";
  renderFullScene();
});

document.getElementById("btn-mode-3d").addEventListener("click", () => {
  currentMode = "3D";
  walkTarget = null;
  document.getElementById("btn-mode-3d").classList.add("active");
  document.getElementById("btn-mode-2d").classList.remove("active");
  document.getElementById("btn-mode-fpv").classList.remove("active");
  document.getElementById("canvas-container").style.display = "none";
  document.getElementById("three-container").style.display = "block";
  document.getElementById("view-controls-2d").style.display = "none";
  document.getElementById("view-controls-3d").style.display = "flex";
  document.getElementById("fpv-hud").style.display = "none";

  if (!renderer) initThree();
  applyCameraProjection();
  controls.enabled = true;
  camera.position.set(appState.room.width / 2, 420, appState.room.depth + 340);
  controls.target.set(appState.room.width / 2, 60, appState.room.depth / 2);
  updateThreeScene();
});

document.getElementById("btn-mode-fpv").addEventListener("click", enterHumanFPV);

window.addEventListener("resize", () => {
  const c2d = document.getElementById("canvas-container");
  if (canvas && c2d.clientWidth > 0) {
    canvas.setWidth(c2d.clientWidth);
    canvas.setHeight(c2d.clientHeight);
  }
  const c3d = document.getElementById("three-container");
  if (renderer && camera && c3d.clientWidth > 0) {
    renderer.setSize(c3d.clientWidth, c3d.clientHeight);
    applyCameraProjection();
  }
});
