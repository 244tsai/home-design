function getDefaultBorderColorByType(t) {
  if (t === "wall_item") return "#10B981";
  if (t === "window") return "#F59E0B";
  if (t === "socket") return "#94A3B8";
  if (t === "door") return "#451A03";
  return "#1E293B";
}

function getItemBorderColor(item) {
  return (item && item.border_color) ? item.border_color : getDefaultBorderColorByType(item ? item.item_type : "furniture");
}

function normalizeAppState(rawState) {
  const st = rawState ? JSON.parse(JSON.stringify(rawState)) : JSON.parse(JSON.stringify(INITIAL_CONFIG));
  if (!st.voids && st.void) {
    st.voids = [{ id: "void_1", name: "留白處 1", x: st.void.x, y: st.void.y, w: st.void.w, d: st.void.d }];
  }
  if (!st.voids) st.voids = [];
  if (!st.categories) st.categories = ["床", "大型家具", "收納櫃體", "椅子", "門窗建材", "機電開關", "牆面裝飾"];
  if (!st.categories.includes("床")) st.categories.unshift("床");
  if (!st.categories.includes("椅子")) st.categories.splice(3, 0, "椅子");

  if (!st.room) st.room = {};
  if (st.room.show_walls === undefined) st.room.show_walls = true;
  if (st.room.show_ceiling === undefined) st.room.show_ceiling = false;
  if (st.room.lock_scale === undefined) st.room.lock_scale = false;
  if (st.room.auto_save === undefined) st.room.auto_save = false;

  if (!st.compass) st.compass = { x: 230, y: 180, rotation: 0, show: true, auto_center: true, show_feixing: false, feixing_year: 2026 };
  if (st.compass.auto_center === undefined) st.compass.auto_center = true;
  if (st.compass.auto_center) {
    st.compass.x = Math.round((st.room.width || 460) / 2);
    st.compass.y = Math.round((st.room.depth || 360) / 2);
  }

  if (!st.human) st.human = {};
  st.human = Object.assign({
    x: 230, y: 230, z: 0, height: 178, rot: 0, pitch: 0,
    posture: "stand", sit_mode: "bed_edge", sit_chair_id: "chair_desk", seat_h: 55,
    lock_horizontal: false, fov_h: 100, fov_up: 50, fov_down: 65
  }, st.human);

  if (!Array.isArray(st.recent_colors) || st.recent_colors.length === 0) {
    st.recent_colors = ["#38BDF8", "#FAD785", "#A0CB88", "#8232FA", "#F59E0B"];
  }
  if (!Array.isArray(st.recent_border_colors) || st.recent_border_colors.length === 0) {
    st.recent_border_colors = ["#1E293B", "#10B981", "#F59E0B", "#94A3B8", "#451A03"];
  }
  if (!st.default_fuji) st.default_fuji = INITIAL_CONFIG.default_fuji;

  (st.items || []).forEach(it => {
    if (it.id === "bed" || it.name === "床") it.category = "床";
    if (it.item_type === "chair" && it.seat_h === undefined) it.seat_h = 45;
    if (!it.border_color) it.border_color = getDefaultBorderColorByType(it.item_type);
  });
  return st;
}

// 啟動時自動讀取上次儲存於本地端 (localStorage) 的設計，確保關閉重開 App 後依然保留上次存檔
function loadInitialAppState() {
  try {
    const saved = localStorage.getItem("room_planner_v9") || localStorage.getItem("room_planner_v8") || localStorage.getItem("room_planner_v7");
    if (saved) {
      return normalizeAppState(JSON.parse(saved));
    }
  } catch (e) {
    console.warn("讀取本地存檔失敗，使用預設配置：", e);
  }
  return normalizeAppState(INITIAL_CONFIG);
}

let appState = loadInitialAppState();
let activeId = null;
let isRenderingScene = false;
let copiedItemData = null;
let canvas, scene, camera, renderer, controls, transformControl;
let currentMode = "2D";
let gizmoMode = "translate";
let selectable3DMeshes = [];
let walkable3DMeshes = [];
let human3DGroup = null;
let targetRingMesh = null;

let isDraggingCanvas = false;
let forcePanMode = false;
let lastClientX = 0, lastClientY = 0;
let touchStartDist = 0, touchStartZoom = 1;
let isOverTrash = false;

let fpvMoveDir = { forward: 0, right: 0 };
let walkTarget = null;
let isLookingFPV = false;
let fpvLastX = 0, fpvLastY = 0;
let toastTimeout = null;
let draggedItemId = null;

let lastValidItemMap = {};
let expandedCategories = new Set();

function showToast(msg) {
  const el = document.getElementById("toast-msg");
  if (!el) return;
  el.innerText = msg;
  el.classList.add("show");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 1600);
}

function isBedItem(it) {
  return it.category === "床" || it.id === "bed" || (it.name && it.name.includes("床") && !it.name.includes("櫃"));
}

function isChairItem(it) {
  return it.item_type === "chair" || it.category === "椅子" || (it.name && it.name.includes("椅"));
}

function isZAdjustableWallType(t) {
  return ["window", "socket", "switch", "wall_item"].includes(t);
}

function isOuterWallProtrudingType(t) {
  return ["window", "socket", "switch"].includes(t);
}

// 計算物件可供人物站上去的有效踏面高度：
// 椅子 (chair) 站上去時固定踩在「椅墊高度 (seat_h)」，而非椅背最高處 (h)！
function getItemSteppableHeight(it) {
  if (!it) return 9999;
  const zBase = it.z || 0;
  if (isChairItem(it)) {
    return zBase + (it.seat_h || 45);
  }
  return zBase + (it.h || 30);
}

// 判斷物件是否可讓人物站上去走過去：
// 比人物身高 1/2 還矮的物件 (stepH <= 身高 * 0.5) 或床鋪，人物皆可站上去並走過去！
function isItemSteppableByHuman(it) {
  if (!it || isOuterWallProtrudingType(it.item_type)) return false;
  if (it.item_type === "wall_item" || it.item_type === "door") return false;
  const halfStature = (appState.human.height || 178) * 0.5;
  const stepH = getItemSteppableHeight(it);
  return isBedItem(it) || stepH <= halfStature;
}

function getItemAABB(it) {
  const rad = (it.rot || 0) * Math.PI / 180;
  const cx = it.x + it.w / 2;
  const cy = it.y + it.d / 2;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bw = it.w * cos + it.d * sin;
  const bd = it.w * sin + it.d * cos;
  return {
    x0: cx - bw / 2,
    y0: cy - bd / 2,
    x1: cx + bw / 2,
    y1: cy + bd / 2,
    bw: bw,
    bd: bd,
    z0: it.z || 0,
    z1: (it.z || 0) + (it.h || 30)
  };
}

function isTwoItemsOverlapping(a, b) {
  const boxA = getItemAABB(a);
  const boxB = getItemAABB(b);
  const eps = 0.4;
  const overlapX = (boxA.x0 + eps < boxB.x1) && (boxA.x1 - eps > boxB.x0);
  const overlapY = (boxA.y0 + eps < boxB.y1) && (boxA.y1 - eps > boxB.y0);
  const overlapZ = (boxA.z0 + eps < boxB.z1) && (boxA.z1 - eps > boxB.z0);
  return overlapX && overlapY && overlapZ;
}

function isItemOverlappingVoid(item, v) {
  // 外推型牆面物件 (窗戶/插座/開關) 位於牆外，不受室內留白處限制；其餘房內物件皆不可進入留白處
  if (isOuterWallProtrudingType(item.item_type)) return false;
  const boxA = getItemAABB(item);
  const eps = 0.4;
  const overlapX = (boxA.x0 + eps < v.x + v.w) && (boxA.x1 - eps > v.x);
  const overlapY = (boxA.y0 + eps < v.y + v.d) && (boxA.y1 - eps > v.y);
  return overlapX && overlapY;
}

function hasVoidCollision(item) {
  if (!appState.voids) return null;
  for (let i = 0; i < appState.voids.length; i++) {
    const v = appState.voids[i];
    if (isItemOverlappingVoid(item, v)) {
      return {
        id: v.id, name: v.name || "留白處", isVoid: true,
        x: v.x, y: v.y, z: 0, w: v.w, d: v.d, h: appState.room.height || 280, rot: 0
      };
    }
  }
  return null;
}

function hasAnyCollision(item) {
  const voidHit = hasVoidCollision(item);
  if (voidHit) return voidHit;
  for (let i = 0; i < appState.items.length; i++) {
    const other = appState.items[i];
    if (other.id === item.id) continue;
    if (isTwoItemsOverlapping(item, other)) return other;
  }
  return null;
}

function saveStateToLocal(showAlert = false) {
  try {
    localStorage.setItem("room_planner_v9", JSON.stringify(appState));
    const nowStr = new Date().toLocaleTimeString();
    const hintEl = document.getElementById("save-status-hint");
    if (hintEl) {
      hintEl.style.color = "#34D399";
      hintEl.innerText = `✅ 已儲存於 App (${nowStr}，重開將自動載入)`;
    }
    if (showAlert) showToast("💾 已成功儲存目前設計至 App！");
    return true;
  } catch (err) {
    console.error("Save error:", err);
    if (showAlert) alert("⚠️ 儲存空間不足（可能因材質圖片過大），建議使用「下載設計資料檔 (.json)」保存！");
    return false;
  }
}

function triggerAutoSaveIfChecked() {
  if (appState.room && appState.room.auto_save) {
    saveStateToLocal(false);
  } else {
    const hintEl = document.getElementById("save-status-hint");
    if (hintEl) {
      hintEl.style.color = "#FBBF24";
      hintEl.innerText = "⚠️ 尚有未儲存變更 (未勾選自動儲存，請按手動儲存)";
    }
  }
}

// 精準將人物 H-Point 對齊椅子：使人背貼齊椅背前緣 (+Z 側)，並朝椅子正面 (-Z 方向) 看出去
function alignHumanToChair(chair) {
  if (!chair) return;
  const s = (appState.human.height || 178) / 175;
  const backThick = Math.max(4, chair.d * 0.12);
  const backFrontZ = chair.d / 2 - backThick;
  const localZ = Math.max(-chair.d * 0.25, backFrontZ - 8.5 * s);
  const rotDeg = ((chair.rot || 0) % 360 + 360) % 360;
  const rotRad = rotDeg * Math.PI / 180;
  const cx = chair.x + chair.w / 2;
  const cy = chair.y + chair.d / 2;

  appState.human.x = Math.round(cx - localZ * Math.sin(rotRad));
  appState.human.y = Math.round(cy + localZ * Math.cos(rotRad));
  appState.human.z = 0; // 雙腳踩在地面
  appState.human.seat_h = chair.seat_h || 45;
  appState.human.rot = rotDeg;
}

function saveValidItemBackup(item) {
  lastValidItemMap[item.id] = {
    x: item.x, y: item.y, z: item.z || 0,
    w: item.w, d: item.d, h: item.h || 30, seat_h: item.seat_h || 45, rot: item.rot || 0
  };
}

function enforceItemConstraints(item, mode = "move", showMsg = false) {
  const rw = appState.room.width;
  const rd = appState.room.depth;
  const rh = appState.room.height;
  const t = item.item_type || "furniture";
  const prev = lastValidItemMap[item.id] || { x: item.x, y: item.y, z: item.z || 0, w: item.w, d: item.d, h: item.h || 30, seat_h: item.seat_h || 45, rot: item.rot || 0 };

  item.h = Math.max(4, Math.min(rh, Math.round(item.h || 30)));
  if (t === "chair") {
    item.seat_h = Math.max(15, Math.min(item.h - 5, Math.round(item.seat_h || 45)));
  }

  if (isZAdjustableWallType(t)) {
    item.z = Math.max(0, Math.min(rh - item.h, Math.round(item.z || 0)));
  } else {
    item.z = 0;
  }

  if (["window", "socket", "switch", "wall_item", "door"].includes(t)) {
    const cx = item.x + item.w / 2;
    const cy = item.y + item.d / 2;
    const distN = Math.abs(cy - 0);
    const distS = Math.abs(cy - rd);
    const distW = Math.abs(cx - 0);
    const distE = Math.abs(cx - rw);
    const minDist = Math.min(distN, distS, distW, distE);

    const protrudeOut = isOuterWallProtrudingType(t);
    const longSide = Math.max(item.w, item.d);
    const shortSide = Math.min(item.w, item.d);

    if (minDist === distN || minDist === distS) {
      item.w = Math.min(rw, longSide);
      item.d = Math.min(shortSide, 24);
      item.rot = 0;
      item.x = Math.max(0, Math.min(rw - item.w, Math.round(cx - item.w / 2)));
      if (minDist === distN) {
        item.y = protrudeOut ? -item.d : 0;
        item.wall = "north";
      } else {
        item.y = protrudeOut ? rd : rd - item.d;
        item.wall = "south";
      }
    } else {
      item.w = Math.min(shortSide, 24);
      item.d = Math.min(rd, longSide);
      item.rot = 0;
      item.y = Math.max(0, Math.min(rd - item.d, Math.round(cy - item.d / 2)));
      if (minDist === distW) {
        item.x = protrudeOut ? -item.w : 0;
        item.wall = "west";
      } else {
        item.x = protrudeOut ? rw : rw - item.w;
        item.wall = "east";
      }
    }
  } else {
    const box = getItemAABB(item);
    const bw = Math.max(1, box.bw);
    const bd = Math.max(1, box.bd);

    const overLeftRatio = (0 - box.x0) / bw;
    const overRightRatio = (box.x1 - rw) / bw;
    const overTopRatio = (0 - box.y0) / bd;
    const overBottomRatio = (box.y1 - rd) / bd;
    const maxOverRatio = Math.max(overLeftRatio, overRightRatio, overTopRatio, overBottomRatio);

    const completelyOutside = (box.x1 <= -8 || box.x0 >= rw + 8 || box.y1 <= -8 || box.y0 >= rd + 8);

    if (!completelyOutside && maxOverRatio > 0) {
      if (maxOverRatio >= 0.75) {
        const gap = 24;
        if (maxOverRatio === overLeftRatio) item.x = Math.round(-bw - gap + (bw - item.w) / 2);
        else if (maxOverRatio === overRightRatio) item.x = Math.round(rw + gap + (bw - item.w) / 2);
        else if (maxOverRatio === overTopRatio) item.y = Math.round(-bd - gap + (bd - item.d) / 2);
        else item.y = Math.round(rd + gap + (bd - item.d) / 2);
        if (showMsg) showToast("📦 超過牆壁 3/4，已移至房外備用區！");
      } else {
        if (mode === "scale") {
          if (box.x0 < 0 || box.x1 > rw) item.w = prev.w;
          if (box.y0 < 0 || box.y1 > rd) item.d = prev.d;
        } else if (mode === "rotate") {
          item.rot = prev.rot;
        }
        const clampedBox = getItemAABB(item);
        if (clampedBox.x0 < 0) item.x += (0 - clampedBox.x0);
        if (clampedBox.x1 > rw) item.x -= (clampedBox.x1 - rw);
        if (clampedBox.y0 < 0) item.y += (0 - clampedBox.y0);
        if (clampedBox.y1 > rd) item.y -= (clampedBox.y1 - rd);
        item.x = Math.round(item.x);
        item.y = Math.round(item.y);
      }
    }
  }

  let hitOther = hasAnyCollision(item);
  if (hitOther) {
    if (mode === "scale") {
      const targetW = item.w, targetD = item.d, targetH = item.h;
      item.w = targetW; item.d = prev.d; item.h = prev.h;
      if (hasAnyCollision(item)) item.w = prev.w;

      item.d = targetD;
      if (hasAnyCollision(item)) item.d = prev.d;

      item.h = targetH;
      if (hasAnyCollision(item)) item.h = prev.h;

      item.x = prev.x; item.y = prev.y; item.z = prev.z;
    } else if (mode === "rotate") {
      item.rot = prev.rot;
    } else {
      const boxA = getItemAABB(item);
      const boxB = getItemAABB(hitOther);

      const pushLeft = boxA.x1 - boxB.x0;
      const pushRight = boxB.x1 - boxA.x0;
      const pushUp = boxA.y1 - boxB.y0;
      const pushDown = boxB.y1 - boxA.y0;

      const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (minPush === pushLeft) item.x -= pushLeft;
      else if (minPush === pushRight) item.x += pushRight;
      else if (minPush === pushUp) item.y -= pushUp;
      else item.y += pushDown;

      const afterBox = getItemAABB(item);
      const wasInside = (prev.x >= 0 && prev.x + prev.w <= rw && prev.y >= 0 && prev.y + prev.d <= rd);
      if (wasInside) {
        if (afterBox.x0 < 0) item.x += (0 - afterBox.x0);
        if (afterBox.x1 > rw) item.x -= (afterBox.x1 - rw);
        if (afterBox.y0 < 0) item.y += (0 - afterBox.y0);
        if (afterBox.y1 > rd) item.y -= (afterBox.y1 - rd);
      }

      if (hasAnyCollision(item)) {
        const tryX = item.x, tryY = item.y;
        item.x = tryX; item.y = prev.y;
        if (hasAnyCollision(item)) {
          item.x = prev.x; item.y = tryY;
          if (hasAnyCollision(item)) {
            item.x = prev.x; item.y = prev.y; item.z = prev.z;
          }
        }
      }
      item.x = Math.round(item.x);
      item.y = Math.round(item.y);
    }
  }

  if (hitOther && hitOther.isVoid && showMsg) {
    showToast("🚫 留白處無法擺放或移入物件！");
  }

  // 若移動或旋轉的是目前人物正坐著的椅子，人物位置與背靠椅背朝向同步跟隨椅子更新
  if (appState.human.posture === "sit" && appState.human.sit_mode === "chair" && appState.human.sit_chair_id === item.id) {
    alignHumanToChair(item);
  } else if (appState.human.posture === "stand") {
    // 若移動高大障礙物與站立人物重合，自動將人物推開至障礙物外緣；若移動矮物件到人物腳下，自動更新人物踏面高度 z
    resolveHumanItemOverlapAfterItemMove(item);
  }

  saveValidItemBackup(item);
  return true;
}

// 當家具移動後若與人物重合：矮物件 (<= 身高 1/2) 讓人物直接站上去；高大物件 (> 身高 1/2) 自動將人物推至邊緣外防卡死
function resolveHumanItemOverlapAfterItemMove(item) {
  if (!item || isOuterWallProtrudingType(item.item_type)) return;
  const radius = 12;
  const rw = appState.room.width, rd = appState.room.depth;

  if (!isItemSteppableByHuman(item) && (item.z || 0) <= 120) {
    const box = getItemAABB(item);
    const hx = appState.human.x, hy = appState.human.y;
    if (hx > box.x0 - radius && hx < box.x1 + radius && hy > box.y0 - radius && hy < box.y1 + radius) {
      const candidates = [
        { x: box.x0 - radius - 2, y: hy },
        { x: box.x1 + radius + 2, y: hy },
        { x: hx, y: box.y0 - radius - 2 },
        { x: hx, y: box.y1 + radius + 2 }
      ].filter(p => p.x >= radius && p.x <= rw - radius && p.y >= radius && p.y <= rd - radius);

      candidates.sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy));
      for (let i = 0; i < candidates.length; i++) {
        const check = checkHumanWalkable(candidates[i].x, candidates[i].y);
        if (check.allowed) {
          appState.human.x = Math.round(candidates[i].x);
          appState.human.y = Math.round(candidates[i].y);
          appState.human.z = check.baseZ;
          initHumanFormValues();
          return;
        }
      }
    }
  }
  // 重新計算腳下踏面高度 (例如矮物或椅子移到腳下時自動站上去，移開時自動落回地面)
  const checkNow = checkHumanWalkable(appState.human.x, appState.human.y);
  appState.human.z = checkNow.baseZ;
  initHumanFormValues();
}

function findNonOverlappingSpot(newItem) {
  saveValidItemBackup(newItem);
  if (!hasAnyCollision(newItem)) {
    enforceItemConstraints(newItem, "move", false);
    return;
  }
  const rw = appState.room.width, rd = appState.room.depth;
  for (let y = 10; y <= rd - newItem.d - 10; y += 25) {
    for (let x = 10; x <= rw - newItem.w - 10; x += 25) {
      newItem.x = x; newItem.y = y;
      if (!hasAnyCollision(newItem)) {
        saveValidItemBackup(newItem);
        return;
      }
    }
  }
  newItem.x = rw + 30;
  newItem.y = 20;
  saveValidItemBackup(newItem);
}

// 人物行走與踏上矮物邏輯：
// 1. 留白處 (voids) 允許人物自由走過。
// 2. 高度 <= 人物身高 1/2 的物件與椅子、床鋪，人物可直接站上去走過去（椅子固定站於椅墊高度 seat_h）。
// 3. 高於身高 1/2 的大型櫃體不可主動走進重合；但若因移動家具造成人物與高櫃重合，允許人物往外走出來脫困！
function checkHumanWalkable(nx, ny) {
  const radius = 11;
  const rw = appState.room.width, rd = appState.room.depth;

  // 若處於坐姿（坐床邊或坐椅子），直接允許定位於該座位基準點
  if (appState.human.posture === "sit") {
    const bed = appState.items.find(i => isBedItem(i));
    if (appState.human.sit_mode === "bed_edge" && bed) {
      appState.human.seat_h = (bed.z || 0) + (bed.h || 55);
    }
    return { allowed: true, baseZ: 0, steppedItem: null };
  }

  if (appState.room.show_walls) {
    if (nx < radius || nx > rw - radius || ny < radius || ny > rd - radius) {
      return { allowed: false, baseZ: appState.human.z || 0, steppedItem: null };
    }
  }

  let supportZ = 0;
  let steppedItem = null;
  const curX = appState.human.x;
  const curY = appState.human.y;

  for (let i = 0; i < appState.items.length; i++) {
    const it = appState.items[i];
    if (isOuterWallProtrudingType(it.item_type) || it.item_type === "door") continue;
    if ((it.z || 0) > 120) continue;

    const rad = -(it.rot || 0) * Math.PI / 180;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.d / 2;

    const dx = nx - cx, dy = ny - cy;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = it.w / 2;
    const halfD = it.d / 2;

    // 判斷是否為可踏上走過去的低矮物件 (<= 身高 1/2) 或椅子 / 床鋪
    if (isItemSteppableByHuman(it)) {
      if (Math.abs(lx) <= halfW + 4 && Math.abs(ly) <= halfD + 4) {
        const stepH = getItemSteppableHeight(it);
        if (stepH >= supportZ) {
          supportZ = stepH;
          steppedItem = it;
        }
      }
    } else if (it.item_type === "furniture" || it.item_type === "chair" || it.item_type === "wall_item") {
      // 高於身高 1/2 的高大物件：不可主動走進，但若目前已經重合則允許往外走出來！
      if (Math.abs(lx) < halfW + radius && Math.abs(ly) < halfD + radius) {
        const cdx = curX - cx, cdy = curY - cy;
        const curLx = cdx * Math.cos(rad) - cdy * Math.sin(rad);
        const curLy = cdx * Math.sin(rad) + cdy * Math.cos(rad);
        const alreadyInside = (Math.abs(curLx) < halfW + radius && Math.abs(curLy) < halfD + radius);

        if (alreadyInside) {
          // 計算離邊界外圍的推進程度：若新座標比舊座標更往外移，放行讓人物走出來！
          const curPen = Math.min(halfW + radius - Math.abs(curLx), halfD + radius - Math.abs(curLy));
          const newPen = Math.min(halfW + radius - Math.abs(lx), halfD + radius - Math.abs(ly));
          if (newPen < curPen - 0.1) {
            continue;
          }
        }
        return { allowed: false, baseZ: appState.human.z || 0, steppedItem: null };
      }
    }
  }
  return { allowed: true, baseZ: supportZ, steppedItem: steppedItem };
}

// 取得床鋪四邊可供坐下的邊緣區段（自動排除緊貼牆壁 < 10cm 的床頭邊，避免坐進牆內卡死）
function getAccessibleBedEdges(bed) {
  const pad = 4;
  const rw = appState.room.width, rd = appState.room.depth;
  const xL = bed.x + pad, xR = bed.x + bed.w - pad;
  const yT = bed.y + pad, yB = bed.y + bed.d - pad;
  const edges = [];

  // 左沿 (West): 由上往下 (yT -> yB)，面向正西 270°
  if (bed.x >= 10) {
    edges.push({ name: "left", x1: xL, y1: yT, x2: xL, y2: yB, outwardRot: 270 });
  }
  // 下沿 (South): 由左往右 (xL -> xR)，面向正南 180°
  if (bed.y + bed.d <= rd - 10) {
    edges.push({ name: "bottom", x1: xL, y1: yB, x2: xR, y2: yB, outwardRot: 180 });
  }
  // 右沿 (East): 由下往上 (yB -> yT)，面向正東 90°
  if (bed.x + bed.w <= rw - 10) {
    edges.push({ name: "right", x1: xR, y1: yB, x2: xR, y2: yT, outwardRot: 90 });
  }
  // 上沿 (North): 由右往左 (xR -> xL)，面向正北 0°
  if (bed.y >= 10) {
    edges.push({ name: "top", x1: xR, y1: yT, x2: xL, y2: yT, outwardRot: 0 });
  }
  if (edges.length === 0) {
    edges.push({ name: "bottom", x1: xL, y1: yB, x2: xR, y2: yB, outwardRot: 180 });
  }
  return edges;
}

// 當人物處於「坐床邊（Bedside Seated Viewport Origin）」模式移動時，投射至最近的可坐床沿並自動面向房內
function clampToBedEdge(nx, ny) {
  const bed = appState.items.find(i => isBedItem(i));
  if (!bed) return { x: nx, y: ny, outwardRot: appState.human.rot || 180 };

  appState.human.seat_h = (bed.z || 0) + (bed.h || 55);
  appState.human.z = 0;

  const edges = getAccessibleBedEdges(bed);
  let bestPt = { x: nx, y: ny, outwardRot: 180, dist: Infinity, edgeIdx: 0, t: 0, len: 1 };

  edges.forEach((e, idx) => {
    const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
    const lenSq = dx * dx + dy * dy;
    const len = Math.max(1, Math.sqrt(lenSq));
    let t = lenSq > 0 ? ((nx - e.x1) * dx + (ny - e.y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = e.x1 + t * dx;
    const py = e.y1 + t * dy;
    const d = Math.hypot(nx - px, ny - py);
    if (d < bestPt.dist) {
      bestPt = { x: Math.round(px), y: Math.round(py), outwardRot: e.outwardRot, dist: d, edgeIdx: idx, t: t, len: len };
    }
  });
  return bestPt;
}

// 支援鍵盤方向鍵 / WASD / 搖桿在床沿一維周長路徑上平滑移動與過彎，完全不卡頓
function slideHumanAlongBedEdge(forward, right, speed) {
  const bed = appState.items.find(i => isBedItem(i));
  if (!bed) return false;
  const edges = getAccessibleBedEdges(bed);
  const cur = clampToBedEdge(appState.human.x, appState.human.y);
  let idx = cur.edgeIdx;
  let distOnEdge = cur.t * cur.len;

  // 右鍵 / 上鍵沿床沿逆時針滑動 (左沿->下沿->右沿->上沿)，左鍵 / 下鍵反向滑動
  const dir = (right !== 0) ? -right : forward;
  distOnEdge += dir * speed;

  while (distOnEdge > edges[idx].len) {
    if (idx < edges.length - 1) {
      distOnEdge -= edges[idx].len;
      idx++;
    } else {
      distOnEdge = edges[idx].len;
      break;
    }
  }
  while (distOnEdge < 0) {
    if (idx > 0) {
      idx--;
      distOnEdge += edges[idx].len;
    } else {
      distOnEdge = 0;
      break;
    }
  }

  const e = edges[idx];
  const ratio = Math.max(0, Math.min(1, distOnEdge / Math.max(1, Math.hypot(e.x2 - e.x1, e.y2 - e.y1))));
  appState.human.x = Math.round(e.x1 + (e.x2 - e.x1) * ratio);
  appState.human.y = Math.round(e.y1 + (e.y2 - e.y1) * ratio);
  appState.human.z = 0;
  appState.human.seat_h = (bed.z || 0) + (bed.h || 55);
  if (!isLookingFPV) {
    appState.human.rot = e.outwardRot;
  }
  return true;
}

function tryMoveHumanTo(nx, ny, showBlockMsg = false) {
  // 若處於「坐床邊」模式，直接沿可坐床沿平滑吸附滑動，絕不因床頭櫃或牆壁半徑而卡住！
  if (appState.human.posture === "sit" && appState.human.sit_mode === "bed_edge") {
    const edgePt = clampToBedEdge(nx, ny);
    appState.human.x = edgePt.x;
    appState.human.y = edgePt.y;
    appState.human.z = 0;
    if (edgePt.outwardRot !== undefined && !isLookingFPV) {
      appState.human.rot = edgePt.outwardRot;
    }
    return true;
  }

  // 若處於「坐椅子上」且手動拖曳人物離開椅子，才切換為坐床邊模式
  if (appState.human.posture === "sit" && appState.human.sit_mode === "chair") {
    const edgePt = clampToBedEdge(nx, ny);
    appState.human.sit_mode = "bed_edge";
    appState.human.x = edgePt.x;
    appState.human.y = edgePt.y;
    appState.human.z = 0;
    appState.human.rot = edgePt.outwardRot || 180;
    return true;
  }

  const res = checkHumanWalkable(nx, ny);
  if (res.allowed) {
    appState.human.x = nx;
    appState.human.y = ny;
    appState.human.z = res.baseZ;
    return true;
  }
  const resX = checkHumanWalkable(nx, appState.human.y);
  if (resX.allowed) {
    appState.human.x = nx;
    appState.human.z = resX.baseZ;
    return true;
  }
  const resY = checkHumanWalkable(appState.human.x, ny);
  if (resY.allowed) {
    appState.human.y = ny;
    appState.human.z = resY.baseZ;
    return true;
  }
  if (showBlockMsg) showToast("⚠️ 前方有家具阻擋，人物已貼齊卡住！");
  return false;
}

// 計算人體工學視點高度（Camera Eye Height）：
// 坐姿眼高（Seated Eye Height）= 座面高度（Seat Pan Height）- 軟墊下陷量（Cushion Compression）+ 軀幹傾角修正後之坐姿眼高偏移（Seated Eye Offset）
function getHumanEyeHeight() {
  const h = appState.human;
  const stature = h.height || 178;
  const baseZ = h.z || 0;

  if (h.posture === "lie") {
    return Math.round(baseZ + 22);
  } else if (h.posture === "sit") {
    const isBedEdge = h.sit_mode === "bed_edge";
    const cushionComp = isBedEdge ? 2.0 : 1.0; // 床墊邊緣下陷約 2cm，工作椅墊下陷約 1cm
    const tiltFactor = isBedEdge ? 0.432 : 0.442; // 床沿無靠背骨盆微前傾造成視點略降，工作椅有靠背支撐
    const effectiveSeatH = Math.max(20, (h.seat_h || 45) - cushionComp);
    return Math.round(effectiveSeatH + stature * tiltFactor);
  }
  return Math.round(baseZ + stature * 0.93);
}

// 更新「選擇坐哪張椅子」下拉選單 (左側面板與第一人稱 HUD 同步)
function renderChairSelectOptions() {
  const chairs = appState.items.filter(it => isChairItem(it));
  const selLeft = document.getElementById("sit-chair-select");
  const selHud = document.getElementById("hud-chair-select");
  if (!selLeft || !selHud) return;

  selLeft.innerHTML = "";
  selHud.innerHTML = "";

  if (chairs.length === 0) {
    selLeft.add(new Option("目前無椅子 (請先新增椅子)", ""));
    selHud.add(new Option("無椅子", ""));
    return;
  }

  chairs.forEach(ch => {
    const sh = ch.seat_h || 45;
    selLeft.add(new Option(`🪑 ${ch.name} (坐墊高 ${sh}cm)`, ch.id));
    selHud.add(new Option(`🪑坐:${ch.name}(${sh}cm)`, ch.id));
  });

  if (appState.human.sit_chair_id && chairs.some(c => c.id === appState.human.sit_chair_id)) {
    selLeft.value = appState.human.sit_chair_id;
    selHud.value = appState.human.sit_chair_id;
  } else {
    appState.human.sit_chair_id = chairs[0].id;
    selLeft.value = chairs[0].id;
    selHud.value = chairs[0].id;
  }
}

// 選擇「坐床邊」（腳著地 Z=0，H-Point 貼齊床高，並依所處床沿自動朝向房內）
window.sitAtBedEdge = function() {
  const bed = appState.items.find(i => isBedItem(i));
  appState.human.posture = "sit";
  appState.human.sit_mode = "bed_edge";
  appState.human.z = 0; // 腳著地
  if (bed) {
    appState.human.seat_h = (bed.z || 0) + (bed.h || 55);
    const pt = clampToBedEdge(appState.human.x, appState.human.y);
    appState.human.x = pt.x;
    appState.human.y = pt.y;
    appState.human.rot = pt.outwardRot !== undefined ? pt.outwardRot : 180;
  } else {
    appState.human.seat_h = 45;
  }
  if (!appState.human.lock_horizontal) appState.human.pitch = -5;
  initHumanFormValues();
  renderFullScene();
  if (currentMode === "FPV") {
    syncFPVCamera();
  } else if (currentMode === "3D" && controls) {
    controls.target.set(appState.human.x, getHumanEyeHeight() * 0.65, appState.human.y);
    controls.update();
  }
  triggerAutoSaveIfChecked();
};

// 選擇「坐椅子上」（先讀取下拉選單選取的椅子 ID，避免被 renderChairSelectOptions 重置，並使人背貼齊椅背朝正面看出去）
window.sitOnSelectedChair = function(explicitChairId) {
  const selEl = document.getElementById("sit-chair-select");
  const chosenId = explicitChairId || (selEl && selEl.value ? selEl.value : appState.human.sit_chair_id);
  let chair = appState.items.find(i => i.id === chosenId && isChairItem(i));
  if (!chair) {
    chair = appState.items.find(i => isChairItem(i));
  }
  if (!chair) {
    showToast("💡 房間內尚無椅子，請先新增模型種類為「椅子」的物件！");
    return;
  }
  appState.human.posture = "sit";
  appState.human.sit_mode = "chair";
  appState.human.sit_chair_id = chair.id;
  alignHumanToChair(chair);
  if (!appState.human.lock_horizontal) appState.human.pitch = -5;

  renderChairSelectOptions();
  initHumanFormValues();
  renderFullScene();
  if (currentMode === "FPV") {
    syncFPVCamera();
  } else if (currentMode === "3D" && controls) {
    controls.target.set(appState.human.x, getHumanEyeHeight() * 0.65, appState.human.y);
    controls.update();
  }
  showToast(`🪑 已坐上「${chair.name}」(背靠椅背、視角朝向 ${appState.human.rot}°)`);
  triggerAutoSaveIfChecked();
};

window.onHudChairSelectChange = function() {
  const val = document.getElementById("hud-chair-select").value;
  if (val) {
    const selLeft = document.getElementById("sit-chair-select");
    if (selLeft) selLeft.value = val;
    window.sitOnSelectedChair(val);
  }
};

const FEIXING_META = {
  1: { name: "一白貪狼", el: "水", luck: "大吉 · 桃花/人緣", color: "#38BDF8", bg: "rgba(14, 116, 144, 0.28)", tip: "利感情、貴人、文昌" },
  2: { name: "二黑巨門", el: "土", luck: "凶 · 病符星", color: "#F87171", bg: "rgba(153, 27, 27, 0.30)", tip: "注意健康，宜掛金屬葫蘆化解" },
  3: { name: "三碧祿存", el: "木", luck: "凶 · 是非/官非", color: "#FB923C", bg: "rgba(154, 52, 18, 0.28)", tip: "易爭執，宜用紅色物件洩木氣" },
  4: { name: "四綠文曲", el: "木", luck: "吉 · 文昌/考運", color: "#4ADE80", bg: "rgba(21, 128, 61, 0.28)", tip: "利學業、研發、企劃創意" },
  5: { name: "五黃廉貞", el: "土", luck: "大凶 · 五黃煞", color: "#EF4444", bg: "rgba(185, 28, 28, 0.42)", tip: "忌動土動工，宜擺銅器或六帝錢" },
  6: { name: "六白武曲", el: "金", luck: "吉 · 偏財/貴人", color: "#FACC15", bg: "rgba(161, 98, 7, 0.28)", tip: "利事業升遷、技術與偏財運" },
  7: { name: "七赤破軍", el: "金", luck: "凶 · 破財/口舌", color: "#F472B6", bg: "rgba(157, 23, 77, 0.28)", tip: "防漏財小人，宜靜置或水局化解" },
  8: { name: "八白左輔", el: "土", luck: "大吉 · 正財星", color: "#FBBF24", bg: "rgba(180, 83, 9, 0.35)", tip: "利正財置產，宜保持明亮整潔" },
  9: { name: "九紫右弼", el: "火", luck: "大吉 · 當運喜慶", color: "#C084FC", bg: "rgba(107, 33, 168, 0.35)", tip: "九運當旺大吉星，利姻緣與百業" }
};
const LUOSHU_OFFSETS = { "SE": -1, "S": 4, "SW": -3, "E": -2, "C": 0, "W": 2, "NE": 3, "N": -4, "NW": 1 };

function getCenterStarByYear(year) {
  let mod = (2026 - year) % 9;
  let star = (1 + mod) % 9;
  return star <= 0 ? star + 9 : star;
}
function getStarAtDir(centerStar, dirKey) {
  let s = (centerStar + LUOSHU_OFFSETS[dirKey]) % 9;
  return s <= 0 ? s + 9 : s;
}

function toggleMobilePanel(target) {
  const lp = document.getElementById("left-panel");
  const rp = document.getElementById("right-panel");
  document.getElementById("mnav-left").classList.toggle("active", target === 'left');
  document.getElementById("mnav-right").classList.toggle("active", target === 'right');
  document.getElementById("mnav-canvas").classList.toggle("active", target === 'canvas');

  if (target === 'left') {
    lp.classList.toggle("open"); rp.classList.remove("open");
  } else if (target === 'right') {
    rp.classList.toggle("open"); lp.classList.remove("open");
  } else {
    lp.classList.remove("open"); rp.classList.remove("open");
  }
}

function switchLeftTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
  document.getElementById("tab-btn-" + tab).classList.add("active");
  document.getElementById("tab-content-" + tab).style.display = "flex";
}

window.toggleLockScaleBtn = function() {
  appState.room.lock_scale = !appState.room.lock_scale;
  syncLockScaleUI();
  renderFullScene();
};

function syncLockScaleUI() {
  const locked = !!appState.room.lock_scale;
  const chk = document.getElementById("lock-scale-chk");
  if (chk) chk.checked = locked;
  const b2d = document.getElementById("btn-lock-scale-2d");
  if (b2d) {
    b2d.innerText = locked ? "🔒 縮放: 鎖定" : "🔓 縮放: 開";
    b2d.classList.toggle("active", locked);
  }
  const b3d = document.getElementById("btn-lock-scale-3d");
  if (b3d) {
    b3d.innerText = locked ? "🔒 縮放: 鎖定" : "🔓 縮放: 開";
    b3d.classList.toggle("active", locked);
  }
  const bScaleGizmo = document.getElementById("btn-3d-scale");
  if (bScaleGizmo) {
    bScaleGizmo.style.opacity = locked ? "0.4" : "1";
  }
  if (locked && gizmoMode === "scale") {
    window.set3DGizmoMode("translate");
  }
}

function renderCategoryUI() {
  const newCatSel = document.getElementById("new-obj-category");
  const propCatSel = document.getElementById("prop-category");
  const tagsBox = document.getElementById("category-tags-container");

  const curNewVal = newCatSel.value;
  const curPropVal = propCatSel.value;

  newCatSel.innerHTML = "";
  propCatSel.innerHTML = "";
  tagsBox.innerHTML = "";

  appState.categories.forEach((cat, idx) => {
    newCatSel.add(new Option(cat, cat));
    propCatSel.add(new Option(cat, cat));

    const tag = document.createElement("div");
    tag.style.cssText = "background:#1F232B; border:1px solid #3B82F6; border-radius:14px; padding:4px 9px; font-size:11px; display:flex; align-items:center; gap:5px; transition:all 0.15s;";
    tag.setAttribute("data-cat", cat);
    tag.innerHTML = `<span>🏷️ ${cat}</span><span style="cursor:pointer;color:#F87171;font-weight:bold;" onclick="deleteCategory(${idx})">✕</span>`;

    tag.addEventListener("dragover", e => { e.preventDefault(); tag.style.background = "#2563EB"; });
    tag.addEventListener("dragleave", () => { tag.style.background = "#1F232B"; });
    tag.addEventListener("drop", e => {
      e.preventDefault();
      tag.style.background = "#1F232B";
      if (draggedItemId) moveItemToCategory(draggedItemId, cat);
    });

    tagsBox.appendChild(tag);
  });

  if (appState.categories.includes(curNewVal)) newCatSel.value = curNewVal;
  if (appState.categories.includes(curPropVal)) propCatSel.value = curPropVal;
}

function moveItemToCategory(itemId, targetCat) {
  const item = appState.items.find(i => i.id === itemId);
  if (!item) return;
  item.category = targetCat;
  expandedCategories.add(targetCat);
  draggedItemId = null;
  updateLeftItemPanel();
  renderRightPanel();
  const check = checkHumanWalkable(appState.human.x, appState.human.y);
  appState.human.z = check.baseZ;
  initHumanFormValues();
  if (renderer) updateThreeScene();
}

window.addCategory = function() {
  const inp = document.getElementById("new-cat-input");
  const val = inp.value.trim();
  if (!val) return;
  if (!appState.categories.includes(val)) {
    appState.categories.push(val);
    inp.value = "";
    renderCategoryUI();
    renderRightPanel();
  }
};

window.deleteCategory = function(idx) {
  if (appState.categories.length <= 1) {
    alert("至少需保留一個分類！");
    return;
  }
  const removed = appState.categories.splice(idx, 1)[0];
  const fallback = appState.categories[0];
  appState.items.forEach(it => { if (it.category === removed) it.category = fallback; });
  renderCategoryUI();
  renderRightPanel();
};

// 左側折疊區塊控制：預設收合，點選標題或選取物件時展開
window.toggleFoldSection = function(secId) {
  const sec = document.getElementById(secId);
  if (!sec) return;
  const isOpen = sec.classList.toggle("open");
  const arrow = document.getElementById(secId + "-arrow");
  if (arrow) arrow.innerText = isOpen ? "▾" : "▸";
};

window.setFoldSectionOpen = function(secId, isOpen) {
  const sec = document.getElementById(secId);
  if (!sec) return;
  sec.classList.toggle("open", !!isOpen);
  const arrow = document.getElementById(secId + "-arrow");
  if (arrow) arrow.innerText = isOpen ? "▾" : "▸";
};

// 順/逆時針 90 度快速翻轉（支援椅子、一般家具與人物）
window.rotateActiveItemBy = function(deltaDeg) {
  if (activeId === "HUMAN") {
    appState.human.rot = ((Math.round(appState.human.rot || 0) + deltaDeg) % 360 + 360) % 360;
    initHumanFormValues();
    renderFullScene();
    if (currentMode === "FPV") syncFPVCamera();
    triggerAutoSaveIfChecked();
    return;
  }
  const item = appState.items.find(i => i.id === activeId);
  if (!item) {
    showToast("💡 請先選取要旋轉 90° 的椅子或物件！");
    return;
  }
  item.rot = ((Math.round(item.rot || 0) + deltaDeg) % 360 + 360) % 360;
  enforceItemConstraints(item, "rotate", true);
  updateLeftItemPanel();
  renderFullScene();
  if (currentMode === "FPV") syncFPVCamera();
  triggerAutoSaveIfChecked();
};

// 複製與貼上功能（支援主畫面按鈕、物件列表按鈕與電腦 Ctrl+C / Ctrl+V）
window.copySelectedItem = function(targetId, evt) {
  if (evt) evt.stopPropagation();
  const idToCopy = targetId || activeId;
  if (!idToCopy || idToCopy === "HUMAN") {
    showToast("💡 請先點選一個要複製的物件！");
    return;
  }
  const item = appState.items.find(i => i.id === idToCopy);
  if (!item) return;
  copiedItemData = JSON.parse(JSON.stringify(item));
  showToast(`📋 已複製「${item.name}」(可按 Ctrl+V 或貼上)`);
};

window.pasteCopiedItem = function() {
  if (!copiedItemData && activeId && activeId !== "HUMAN") {
    const cur = appState.items.find(i => i.id === activeId);
    if (cur) copiedItemData = JSON.parse(JSON.stringify(cur));
  }
  if (!copiedItemData) {
    showToast("⚠️ 剪貼簿尚無物件，請先點選物件並按「複製 (Ctrl+C)」！");
    return;
  }
  const copy = JSON.parse(JSON.stringify(copiedItemData));
  copy.id = "item_" + Date.now() + "_" + Math.floor(Math.random() * 100);
  const baseName = (copy.name || "物件").replace(/\(複本\)$/, "");
  copy.name = baseName + "(複本)";
  copy.x = (copy.x || 100) + 25;
  copy.y = (copy.y || 100) + 25;
  expandedCategories.add(copy.category || appState.categories[0]);
  findNonOverlappingSpot(copy);
  appState.items.push(copy);
  copiedItemData = JSON.parse(JSON.stringify(copy));
  activeId = copy.id;
  renderFullScene();
  selectItemById(copy.id);
  showToast(`📥 已貼上「${copy.name}」`);
  triggerAutoSaveIfChecked();
};

// 前五次使用顏色紀錄與色票渲染
function pushRecentColor(listKey, hexColor) {
  if (!hexColor) return;
  const norm = hexColor.toUpperCase();
  if (!Array.isArray(appState[listKey])) appState[listKey] = [];
  appState[listKey] = [norm, ...appState[listKey].filter(c => c.toUpperCase() !== norm)].slice(0, 5);
  renderRecentColorSwatches();
}

function renderRecentColorSwatches() {
  const fillBox = document.getElementById("recent-fill-colors");
  const borderBox = document.getElementById("recent-border-colors");
  if (fillBox) {
    fillBox.innerHTML = `<span class="recent-color-label">前5次色:</span>`;
    (appState.recent_colors || []).slice(0, 5).forEach(col => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch-btn";
      btn.style.background = col;
      btn.title = `套用顏色 ${col}`;
      btn.onclick = () => {
        const item = appState.items.find(i => i.id === activeId);
        if (!item) return;
        item.color = col;
        document.getElementById("prop-color").value = col;
        pushRecentColor("recent_colors", col);
        updateSingleItemVisual(item, "move");
        triggerAutoSaveIfChecked();
      };
      fillBox.appendChild(btn);
    });
  }
  if (borderBox) {
    borderBox.innerHTML = `<span class="recent-color-label">前5次色:</span>`;
    (appState.recent_border_colors || []).slice(0, 5).forEach(col => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch-btn";
      btn.style.background = col;
      btn.title = `套用邊框色 ${col}`;
      btn.onclick = () => {
        const item = appState.items.find(i => i.id === activeId);
        if (!item) return;
        item.border_color = col;
        document.getElementById("prop-border-color").value = col;
        pushRecentColor("recent_border_colors", col);
        updateSingleItemVisual(item, "move");
        triggerAutoSaveIfChecked();
      };
      borderBox.appendChild(btn);
    });
  }
}

window.addEventListener("keydown", function(e) {
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  // 支援電腦 Ctrl+C / Cmd+C 複製與 Ctrl+V / Cmd+V 貼上
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "c" || e.key === "C") {
      if (activeId && activeId !== "HUMAN") {
        e.preventDefault();
        window.copySelectedItem(activeId);
      }
      return;
    }
    if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      window.pasteCopiedItem();
      return;
    }
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (activeId && activeId !== "HUMAN") {
      e.preventDefault();
      deleteItemById(activeId);
    }
  }
  // 2D / 3D / FPV 皆支援方向鍵與 WASD 移動人物（站立時可踏上矮物或脫離重合，坐床邊時沿床沿移動）
  const step2D = 10;
  if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") {
    fpvMoveDir.forward = 1; walkTarget = null;
    if (currentMode === "2D") {
      if (appState.human.posture === "sit" && appState.human.sit_mode === "bed_edge") slideHumanAlongBedEdge(1, 0, 8);
      else tryMoveHumanTo(appState.human.x, appState.human.y - step2D, true);
      initHumanFormValues(); renderFullScene();
    }
  }
  if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
    fpvMoveDir.forward = -1; walkTarget = null;
    if (currentMode === "2D") {
      if (appState.human.posture === "sit" && appState.human.sit_mode === "bed_edge") slideHumanAlongBedEdge(-1, 0, 8);
      else tryMoveHumanTo(appState.human.x, appState.human.y + step2D, true);
      initHumanFormValues(); renderFullScene();
    }
  }
  if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
    fpvMoveDir.right = -1; walkTarget = null;
    if (currentMode === "2D") {
      if (appState.human.posture === "sit" && appState.human.sit_mode === "bed_edge") slideHumanAlongBedEdge(0, -1, 8);
      else tryMoveHumanTo(appState.human.x - step2D, appState.human.y, true);
      initHumanFormValues(); renderFullScene();
    }
  }
  if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
    fpvMoveDir.right = 1; walkTarget = null;
    if (currentMode === "2D") {
      if (appState.human.posture === "sit" && appState.human.sit_mode === "bed_edge") slideHumanAlongBedEdge(0, 1, 8);
      else tryMoveHumanTo(appState.human.x + step2D, appState.human.y, true);
      initHumanFormValues(); renderFullScene();
    }
  }
});

window.addEventListener("keyup", function(e) {
  if (["w","W","s","S","ArrowUp","ArrowDown"].includes(e.key)) fpvMoveDir.forward = 0;
  if (["a","A","d","D","ArrowLeft","ArrowRight"].includes(e.key)) fpvMoveDir.right = 0;
});

function bindDpadBtn(btnId, rightVal, forwardVal) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const start = (e) => { e.preventDefault(); e.stopPropagation(); walkTarget = null; fpvMoveDir.right = rightVal; fpvMoveDir.forward = forwardVal; };
  const end = (e) => { e.preventDefault(); e.stopPropagation(); fpvMoveDir.right = 0; fpvMoveDir.forward = 0; };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointerleave", end);
  btn.addEventListener("pointercancel", end);
}

function initFabric() {
  const container = document.getElementById("canvas-container");
  canvas = new fabric.Canvas('fabric-canvas', {
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundColor: '#0A0C10',
    selection: false,
    preserveObjectStacking: true
  });

  appState.items.forEach(it => saveValidItemBackup(it));

  bindDpadBtn("dpad-up", 0, 1);
  bindDpadBtn("dpad-down", 0, -1);
  bindDpadBtn("dpad-left", -1, 0);
  bindDpadBtn("dpad-right", 1, 0);

  document.getElementById("lock-scale-chk").addEventListener("change", e => {
    appState.room.lock_scale = e.target.checked;
    syncLockScaleUI();
    renderFullScene();
    triggerAutoSaveIfChecked();
  });

  const autoSaveChk = document.getElementById("auto-save-chk");
  if (autoSaveChk) {
    autoSaveChk.checked = !!appState.room.auto_save;
    autoSaveChk.addEventListener("change", e => {
      appState.room.auto_save = e.target.checked;
      if (appState.room.auto_save) {
        saveStateToLocal(true);
      } else {
        // 將取消自動儲存的設定寫入本地，但後續異動需手動按存檔
        try { localStorage.setItem("room_planner_v9", JSON.stringify(appState)); } catch (err) {}
        const hintEl = document.getElementById("save-status-hint");
        if (hintEl) {
          hintEl.style.color = "#94A3B8";
          hintEl.innerText = "ℹ️ 已關閉自動儲存，請於修改後按「手動儲存」";
        }
      }
    });
  }

  canvas.on('mouse:wheel', function(opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom() * (0.999 ** delta);
    zoom = Math.min(Math.max(zoom, 0.2), 5);
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
  });

  canvas.on('mouse:down', function(opt) {
    const evt = opt.e;
    const target = opt.target;
    const isSelectable = target && (target.itemId || target.isHuman || (target.voidId && appState.room.editable));

    if (!isSelectable || forcePanMode || evt.button === 1 || evt.altKey) {
      isDraggingCanvas = true;
      const pt = (evt.touches && evt.touches[0]) ? evt.touches[0] : evt;
      lastClientX = pt.clientX;
      lastClientY = pt.clientY;
    }
  });

  canvas.on('mouse:move', function(opt) {
    if (!isDraggingCanvas) return;
    const evt = opt.e;
    if (evt.touches && evt.touches.length > 1) return;
    const pt = (evt.touches && evt.touches[0]) ? evt.touches[0] : evt;
    const vpt = canvas.viewportTransform;
    vpt[4] += pt.clientX - lastClientX;
    vpt[5] += pt.clientY - lastClientY;
    canvas.requestRenderAll();
    lastClientX = pt.clientX;
    lastClientY = pt.clientY;
  });

  canvas.on('mouse:up', function() {
    isDraggingCanvas = false;
    const trashEl = document.getElementById("trash-dropzone");
    if (trashEl.classList.contains("show")) {
      if (isOverTrash && activeId && activeId !== "HUMAN") {
        deleteItemById(activeId);
      }
      trashEl.classList.remove("show", "hover");
      isOverTrash = false;
    }
  });

  const upperCanvas = canvas.upperCanvasEl;
  upperCanvas.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      isDraggingCanvas = false;
      touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      touchStartZoom = canvas.getZoom();
    }
  }, { passive: false });

  upperCanvas.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      let newZoom = Math.min(Math.max(touchStartZoom * (dist / touchStartDist), 0.2), 4.5);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      canvas.zoomToPoint({ x: cx, y: cy }, newZoom);
    }
  }, { passive: false });

  canvas.on('selection:created', onObjectSelected);
  canvas.on('selection:updated', onObjectSelected);
  canvas.on('selection:cleared', onObjectDeselected);
  canvas.on('object:moving', e => onObjectLiveTransform(e, "move"));
  canvas.on('object:scaling', e => onObjectLiveTransform(e, "scale"));
  canvas.on('object:rotating', e => onObjectLiveTransform(e, "rotate"));
  canvas.on('object:modified', onObjectModifiedComplete);

  const initWalk = checkHumanWalkable(appState.human.x, appState.human.y);
  appState.human.z = initWalk.baseZ;

  renderCategoryUI();
  renderRecentColorSwatches();
  renderChairSelectOptions();
  initRoomFormValues();
  initHumanFormValues();
  syncLockScaleUI();
  renderVoidListUI();
  renderFullScene();
  zoomToFit();
  initPanelResizers();
  initFPVHudDragAndResize();
}

function renderFullScene() {
  if (!canvas) return;
  isRenderingScene = true;
  try {
    canvas.clear();
    canvas.backgroundColor = '#0A0C10';

  const rw = appState.room.width, rd = appState.room.depth;

  canvas.add(new fabric.Rect({
    left: 0, top: 0, width: rw, height: rd,
    fill: '#5089C6', stroke: '#38BDF8', strokeWidth: 2,
    selectable: false, evented: false
  }));

  canvas.add(new fabric.Text(`◀ 房間寬 ${rw} cm ▶`, {
    left: rw / 2, top: -24, fontSize: 13, fill: '#94A3B8', originX: 'center', selectable: false, evented: false
  }));
  canvas.add(new fabric.Text(`◀ 房間深 ${rd} cm ▶`, {
    left: -24, top: rd / 2, fontSize: 13, fill: '#94A3B8', originX: 'center', angle: -90, selectable: false, evented: false
  }));

  const canEditGround = !!appState.room.editable && !forcePanMode;
  appState.voids.forEach(v => {
    const vRect = new fabric.Rect({
      width: v.w, height: v.d, fill: '#FFFFFF',
      stroke: canEditGround ? '#2563EB' : '#CBD5E1',
      strokeWidth: canEditGround ? 2.5 : 1.5,
      strokeDashArray: canEditGround ? [5, 3] : null,
      originX: 'center', originY: 'center'
    });
    const vLabel = new fabric.Text(`${v.name}\n${Math.round(v.w)}×${Math.round(v.d)}`, {
      fontSize: 12, fill: '#334155', originX: 'center', originY: 'center', textAlign: 'center'
    });
    const vGroup = new fabric.Group([vRect, vLabel], {
      left: v.x + v.w / 2, top: v.y + v.d / 2,
      originX: 'center', originY: 'center',
      selectable: canEditGround, evented: canEditGround, voidId: v.id
    });
    vGroup.setControlsVisibility({ mtr: false });
    canvas.add(vGroup);
  });

  appState.items.forEach(item => createFabricItem(item));

  if (appState.compass.show_feixing) renderNinePalaceFeixing();
  if (appState.compass.show) renderExpertCompass();

  createFabricHuman();

  if (activeId === "HUMAN") {
    const hg = canvas.getObjects().find(o => o.isHuman);
    if (hg && !forcePanMode) canvas.setActiveObject(hg);
  } else if (activeId) {
    const g = canvas.getObjects().find(o => o.itemId === activeId);
    if (g && !forcePanMode) canvas.setActiveObject(g);
  }

    renderChairSelectOptions();
    renderRightPanel();
    canvas.requestRenderAll();
    if ((currentMode === "3D" || currentMode === "FPV") && renderer) updateThreeScene();
  } finally {
    isRenderingScene = false;
  }
}

function createFabricHuman() {
  const h = appState.human;
  const halfFovRad = ((h.fov_h || 100) / 2) * Math.PI / 180;
  const coneLen = 48;
  const coneHalfW = Math.round(Math.tan(halfFovRad) * coneLen);

  const fovCone = new fabric.Polygon([
    { x: 0, y: 0 }, { x: -coneHalfW, y: -coneLen }, { x: coneHalfW, y: -coneLen }
  ], {
    fill: 'rgba(168, 85, 247, 0.30)', stroke: '#C084FC', strokeWidth: 1.5,
    originX: 'center', originY: 'bottom', top: 0
  });

  const postureColor = h.posture === 'lie' ? '#EC4899' : (h.posture === 'sit' ? '#0EA5E9' : '#9333EA');
  const postureIcon = h.posture === 'lie' ? "🛏️" : (h.posture === 'sit' ? "🪑" : "🧍");

  const bodyCircle = new fabric.Circle({
    radius: 14, fill: postureColor, stroke: '#FFFFFF', strokeWidth: 2.5,
    originX: 'center', originY: 'center'
  });

  const iconTxt = new fabric.Text(postureIcon, {
    fontSize: 14, originX: 'center', originY: 'center'
  });

  const humanGroup = new fabric.Group([fovCone, bodyCircle, iconTxt], {
    left: h.x, top: h.y, angle: h.rot || 0,
    originX: 'center', originY: 'center',
    selectable: !forcePanMode, evented: !forcePanMode,
    isHuman: true
  });

  humanGroup.setControlsVisibility({
    mt: false, mb: false, ml: false, mr: false,
    tl: false, tr: false, bl: false, br: false,
    mtr: true
  });

  canvas.add(humanGroup);
}

function createFabricItem(item) {
  const subElements = [];
  const borderCol = getItemBorderColor(item);
  const rect = new fabric.Rect({
    width: item.w, height: item.d,
    fill: item.color, stroke: borderCol, strokeWidth: 2,
    originX: 'center', originY: 'center'
  });
  subElements.push(rect);

  // 若為椅子，在 2D 平面繪製椅背條，清楚標示椅背位置 (+Y 側為椅背，人物坐上時背靠此側朝對向看出去)
  if (item.item_type === "chair") {
    const backrest = new fabric.Rect({
      width: item.w * 0.85, height: Math.max(4, item.d * 0.16),
      fill: '#0284C7', stroke: borderCol, strokeWidth: 1,
      originX: 'center', originY: 'center',
      top: item.d / 2 - Math.max(3, item.d * 0.1)
    });
    subElements.push(backrest);
  }

  if (item.item_type === "door") {
    const fx = item.flip_x ? -1 : 1;
    const fy = item.flip_y ? -1 : 1;
    const hx = -item.w / 2 * fx;
    const hy = item.d / 2 * fy;
    const openX = hx;
    const openY = hy + item.w * fy;
    const closedX = item.w / 2 * fx;
    const closedY = hy;
    const sweep = (fx * fy > 0) ? 0 : 1;

    const arcPath = new fabric.Path(`M ${hx} ${hy} L ${openX} ${openY} A ${item.w} ${item.w} 0 0 ${sweep} ${closedX} ${closedY}`, {
      fill: 'rgba(251, 146, 60, 0.18)', stroke: '#FDBA74', strokeWidth: 1.5, strokeDashArray: [4, 3]
    });
    subElements.push(arcPath);
  }

  const labelStr = `${item.name}\n${Math.round(item.w)}×${Math.round(item.d)}`;
  const fontSize = Math.max(9, Math.min(12, Math.min(item.w, item.d) * 0.45));
  const text = new fabric.Text(labelStr, {
    fontSize: fontSize, fill: '#FFFFFF',
    originX: 'center', originY: 'center', textAlign: 'center'
  });
  subElements.push(text);

  const lockS = !!appState.room.lock_scale;
  const group = new fabric.Group(subElements, {
    left: item.x + item.w / 2, top: item.y + item.d / 2,
    angle: item.rot || 0, originX: 'center', originY: 'center',
    lockScalingX: lockS, lockScalingY: lockS,
    selectable: !forcePanMode, evented: !forcePanMode, itemId: item.id
  });

  group.setControlsVisibility({
    mt: !lockS, mb: !lockS, ml: !lockS, mr: !lockS,
    tl: !lockS, tr: !lockS, bl: !lockS, br: !lockS,
    mtr: true
  });

  if (item.texture) {
    fabric.Image.fromURL(item.texture, function(img) {
      img.scaleToWidth(item.w);
      img.scaleToHeight(item.d);
      rect.set('fill', new fabric.Pattern({ source: img.getElement(), repeat: 'repeat' }));
      canvas.requestRenderAll();
    });
  }

  canvas.add(group);
}

function renderNinePalaceFeixing() {
  const rw = appState.room.width, rd = appState.room.depth;
  const cw = rw / 3, cd = rd / 3;
  const year = parseInt(appState.compass.feixing_year) || 2026;
  const centerStar = getCenterStarByYear(year);

  const infoEl = document.getElementById("feixing-center-info");
  if (infoEl) infoEl.innerText = `${year}年: ${FEIXING_META[centerStar].name}入中宮`;

  const rot = appState.compass.rotation || 0;
  const dirAngles = [
    { key: "W", deg: 0, label: "正西" }, { key: "NW", deg: 45, label: "西北" },
    { key: "N", deg: 90, label: "正北" }, { key: "NE", deg: 135, label: "東北" },
    { key: "E", deg: 180, label: "正東" }, { key: "SE", deg: 225, label: "東南" },
    { key: "S", deg: 270, label: "正南" }, { key: "SW", deg: 315, label: "西南" }
  ];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const gx = col * cw, gy = row * cd;
      let dirKey = "C", dirLabel = "中宮";
      if (!(row === 1 && col === 1)) {
        let cellDeg = Math.atan2(row - 1, col - 1) * 180 / Math.PI;
        if (cellDeg < 0) cellDeg += 360;
        let relDeg = (cellDeg - rot) % 360;
        if (relDeg < 0) relDeg += 360;
        const idx = Math.round(relDeg / 45) % 8;
        dirKey = dirAngles[idx].key;
        dirLabel = dirAngles[idx].label;
      }
      const starNum = getStarAtDir(centerStar, dirKey);
      const meta = FEIXING_META[starNum];

      canvas.add(new fabric.Rect({
        left: gx, top: gy, width: cw, height: cd,
        fill: meta.bg, stroke: '#F59E0B', strokeWidth: 1.5, strokeDashArray: [6, 4],
        selectable: false, evented: false
      }));
      canvas.add(new fabric.Text(`【${dirLabel}】${meta.name} (${meta.el})`, {
        left: gx + cw / 2, top: gy + 18, fontSize: 13, fontWeight: 'bold', fill: meta.color,
        backgroundColor: 'rgba(10, 12, 16, 0.82)', originX: 'center', originY: 'center', selectable: false, evented: false
      }));
      canvas.add(new fabric.Text(`${meta.luck}\n${meta.tip}`, {
        left: gx + cw / 2, top: gy + 42, fontSize: 11, fill: '#F8FAFC',
        backgroundColor: 'rgba(15, 23, 42, 0.78)', originX: 'center', originY: 'center', textAlign: 'center', selectable: false, evented: false
      }));
    }
  }
}

function renderExpertCompass() {
  const cx = appState.compass.x, cy = appState.compass.y;
  const rot = appState.compass.rotation || 0;
  const radius = Math.max(appState.room.width, appState.room.depth) * 0.72;

  [radius * 0.25, radius * 0.5, radius * 0.75, radius].forEach((r, idx) => {
    canvas.add(new fabric.Circle({
      left: cx - r, top: cy - r, radius: r, fill: 'transparent',
      stroke: idx === 3 ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.16)',
      strokeWidth: idx === 3 ? 1.8 : 1, strokeDashArray: idx % 2 === 1 ? [5, 5] : null,
      selectable: false, evented: false
    }));
  });

  const directions = [
    { deg: 0, label: "正西 [兌]", primary: true }, { deg: 45, label: "西北 [乾]", primary: false },
    { deg: 90, label: "正北 [坎]", primary: true }, { deg: 135, label: "東北 [艮]", primary: false },
    { deg: 180, label: "正東 [震]", primary: true }, { deg: 225, label: "東南 [巽]", primary: false },
    { deg: 270, label: "正南 [離]", primary: true }, { deg: 315, label: "西南 [坤]", primary: false }
  ];

  directions.forEach(dir => {
    const rad = (dir.deg + rot) * Math.PI / 180;
    canvas.add(new fabric.Line([cx, cy, cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)], {
      stroke: dir.primary ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.35)',
      strokeWidth: dir.primary ? 2.2 : 1.2, selectable: false, evented: false
    }));
    canvas.add(new fabric.Text(dir.label, {
      left: cx + (radius + 24) * Math.cos(rad), top: cy + (radius + 24) * Math.sin(rad),
      fontSize: dir.primary ? 14 : 11, fontWeight: dir.primary ? 'bold' : 'normal',
      fill: dir.primary ? '#F3E8FF' : '#CBD5E1',
      backgroundColor: dir.primary ? 'rgba(107, 33, 168, 0.78)' : 'rgba(15, 23, 42, 0.68)',
      originX: 'center', originY: 'center', selectable: false, evented: false
    }));
  });
}

function onObjectSelected(e) {
  if (isRenderingScene) return;
  const target = e.selected ? e.selected[0] : null;
  if (!target) return;
  if (target.isHuman) {
    activeId = "HUMAN";
    switchLeftTab('human');
    initHumanFormValues();
    highlightRightPanel();
  } else if (target.itemId) {
    activeId = target.itemId;
    switchLeftTab('item');
    setFoldSectionOpen('fold-sec-edit', true);
    updateLeftItemPanel();
    highlightRightPanel();
  } else if (target.voidId) {
    switchLeftTab('room');
  }
}

function onObjectDeselected() {
  if (isRenderingScene) return;
  activeId = null;
  document.getElementById("no-selection").style.display = "block";
  document.getElementById("prop-editor").style.display = "none";
  setFoldSectionOpen('fold-sec-edit', false);
  highlightRightPanel();
}

function onObjectLiveTransform(e, mode) {
  const target = e.target;
  if (!target) return;

  if (target.itemId && e.e) {
    const trashEl = document.getElementById("trash-dropzone");
    trashEl.classList.add("show");
    const pt = (e.e.touches && e.e.touches[0]) ? e.e.touches[0] : e.e;
    const rect = trashEl.getBoundingClientRect();
    // 僅當游標真正進入位於頂部工具列的垃圾桶按鈕範圍內才觸發刪除，不佔用房間畫布範圍
    isOverTrash = (pt.clientX >= rect.left && pt.clientX <= rect.right && pt.clientY >= rect.top && pt.clientY <= rect.bottom);
    trashEl.classList.toggle("hover", isOverTrash);
  }

  if (target.isHuman) {
    const nx = Math.round(target.left);
    const ny = Math.round(target.top);
    tryMoveHumanTo(nx, ny, false);
    target.set({ left: appState.human.x, top: appState.human.y });
    appState.human.rot = Math.round((target.angle % 360 + 360) % 360);
    initHumanFormValues();

  } else if (target.itemId) {
    const item = appState.items.find(i => i.id === target.itemId);
    if (!item) return;

    if (target.flipX) {
      item.flip_x = !item.flip_x;
      target.set('flipX', false);
    }
    if (target.flipY) {
      item.flip_y = !item.flip_y;
      target.set('flipY', false);
    }

    const baseRect = target.item(0);
    if (mode === "scale" && !appState.room.lock_scale) {
      item.w = Math.max(4, Math.round(baseRect.width * Math.abs(target.scaleX)));
      item.d = Math.max(4, Math.round(baseRect.height * Math.abs(target.scaleY)));
    }
    item.rot = Math.round((target.angle % 360 + 360) % 360);
    item.x = Math.round(target.left - item.w / 2);
    item.y = Math.round(target.top - item.d / 2);

    enforceItemConstraints(item, mode, false);

    if (mode === "scale") {
      target.set({
        scaleX: item.w / baseRect.width,
        scaleY: item.d / baseRect.height,
        left: item.x + item.w / 2,
        top: item.y + item.d / 2
      });
    } else if (mode === "rotate") {
      target.set({ angle: item.rot });
    } else {
      target.set({
        left: item.x + item.w / 2,
        top: item.y + item.d / 2
      });
    }
    updateLeftItemPanel();

  } else if (target.voidId) {
    const v = appState.voids.find(x => x.id === target.voidId);
    if (!v) return;
    const baseRect = target.item(0);
    v.w = Math.max(10, Math.round(baseRect.width * Math.abs(target.scaleX)));
    v.d = Math.max(10, Math.round(baseRect.height * Math.abs(target.scaleY)));
    v.x = Math.round(target.left - v.w / 2);
    v.y = Math.round(target.top - v.d / 2);
    renderVoidListUI();
  }
}

function onObjectModifiedComplete(e) {
  const trashEl = document.getElementById("trash-dropzone");
  if (isOverTrash && activeId && activeId !== "HUMAN") {
    trashEl.classList.remove("show", "hover");
    isOverTrash = false;
    deleteItemById(activeId);
    return;
  }
  trashEl.classList.remove("show", "hover");
  isOverTrash = false;
  // 若修改的是留白處，確保房間內既有物件不會與新的留白處重疊
  appState.items.forEach(it => enforceItemConstraints(it, "move", false));
  renderFullScene();
  triggerAutoSaveIfChecked();
}

function setInputValueSafe(id, val) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) {
    el.value = val;
  }
}

function updateLeftItemPanel() {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;

  document.getElementById("no-selection").style.display = "none";
  document.getElementById("prop-editor").style.display = "flex";
  setFoldSectionOpen("fold-sec-edit", true);

  const typeNames = {
    furniture: "🛋️ 家具 / 床 (貼地)",
    chair: "🪑 椅子 (可設坐墊高)",
    wall_item: "🖼️ 牆壁上物品 (貼牆可調Z)",
    door: "🚪 房門 (貼牆貼地)",
    window: "🪟 窗戶 (貼牆外突)",
    socket: "🔌 插座 (貼牆外突)",
    switch: "💡 開關 (貼牆外突)"
  };
  const t = item.item_type || "furniture";
  document.getElementById("prop-type-badge").innerText = typeNames[t] || typeNames.furniture;

  setInputValueSafe("prop-name", item.name);
  setInputValueSafe("prop-category", item.category || appState.categories[0]);
  setInputValueSafe("prop-type", t);
  setInputValueSafe("prop-w", Math.round(item.w));
  setInputValueSafe("prop-d", Math.round(item.d));
  setInputValueSafe("prop-h", item.h || 30);
  setInputValueSafe("prop-seath", item.seat_h || 45);
  setInputValueSafe("prop-x", Math.round(item.x));
  setInputValueSafe("prop-y", Math.round(item.y));
  setInputValueSafe("prop-z", Math.round(item.z || 0));
  setInputValueSafe("prop-rot", item.rot || 0);
  setInputValueSafe("prop-rot-slider", item.rot || 0);
  document.getElementById("prop-rot-val").innerText = (item.rot || 0) + "°";
  setInputValueSafe("prop-color", item.color || "#38BDF8");
  setInputValueSafe("prop-border-color", getItemBorderColor(item));

  const lockS = !!appState.room.lock_scale;
  document.getElementById("prop-w").disabled = lockS;
  document.getElementById("prop-d").disabled = lockS;
  document.getElementById("prop-h").disabled = lockS;

  document.getElementById("prop-seath-row").style.display = (t === "chair") ? "flex" : "none";

  const canZ = isZAdjustableWallType(t);
  document.getElementById("prop-z-row").style.display = canZ ? "flex" : "none";
  document.getElementById("prop-z-hint").style.display = canZ ? "inline" : "none";

  document.getElementById("door-swing-group").style.display = (t === "door") ? "flex" : "none";
  document.getElementById("scenery-upload-group").style.display = (t === "window") ? "flex" : "none";

  const promptEl = document.getElementById("prop-higgsfield-prompt");
  if (promptEl && document.activeElement !== promptEl) {
    promptEl.value = generateHiggsfieldPromptForItem(item);
  }
}

function updateSingleItemVisual(item, mode = "move", enforceNow = true) {
  if (enforceNow) {
    enforceItemConstraints(item, mode, true);
  }
  updateLeftItemPanel();
  // 在編輯欄位連續輸入多位數或改變顏色/位置時，直接局部更新 Fabric 物件與 3D 場景，絕不清空畫布導致輸入框失焦跳出！
  if (canvas && item.item_type !== "door") {
    const grp = canvas.getObjects().find(o => o.itemId === item.id);
    if (grp) {
      const baseRect = grp.item(0);
      if (mode === "scale" && baseRect) {
        grp.set({
          scaleX: item.w / baseRect.width,
          scaleY: item.d / baseRect.height,
          left: item.x + item.w / 2,
          top: item.y + item.d / 2
        });
      } else {
        grp.set({
          left: item.x + item.w / 2,
          top: item.y + item.d / 2,
          angle: item.rot || 0
        });
      }
      if (baseRect) {
        if (!item.texture) baseRect.set('fill', item.color);
        baseRect.set('stroke', getItemBorderColor(item));
      }
      const labelObj = grp.getObjects().find(o => o.type === 'text');
      if (labelObj) labelObj.set('text', `${item.name}\n${Math.round(item.w)}×${Math.round(item.d)}`);
      grp.setCoords();
      canvas.requestRenderAll();
      highlightRightPanel();
      if ((currentMode === "3D" || currentMode === "FPV") && renderer) updateThreeScene();
      return;
    }
  }
  renderFullScene();
}

const PROP_INPUT_IDS = ["prop-name", "prop-category", "prop-type", "prop-w", "prop-d", "prop-h", "prop-seath", "prop-x", "prop-y", "prop-z", "prop-rot", "prop-color", "prop-border-color"];

PROP_INPUT_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("input", (e) => {
    const item = appState.items.find(i => i.id === activeId);
    if (!item) return;

    const rawVal = e.target.value;
    let mode = "move";
    let enforceNow = false; // 輸入數字過程中不強制彈回，讓使用者能順暢輸入 2~4 位數

    if (id === "prop-name") {
      item.name = rawVal;
    } else if (id === "prop-category") {
      item.category = rawVal;
      expandedCategories.add(rawVal);
      renderFullScene();
      triggerAutoSaveIfChecked();
      return;
    } else if (id === "prop-type") {
      item.item_type = rawVal;
      if (!item.border_color) item.border_color = getDefaultBorderColorByType(rawVal);
      if (rawVal === "chair" && !item.seat_h) { item.seat_h = 45; item.h = Math.max(item.h, 80); }
      if (rawVal === "window" && !item.scenery) item.scenery = appState.default_fuji;
      if (!isZAdjustableWallType(rawVal)) item.z = 0;
      enforceItemConstraints(item, "move", true);
      updateLeftItemPanel();
      renderFullScene();
      triggerAutoSaveIfChecked();
      return;
    } else if (id === "prop-color") {
      item.color = rawVal;
    } else if (id === "prop-border-color") {
      item.border_color = rawVal;
    } else {
      if (rawVal === "" || rawVal === "-") return;
      const num = parseFloat(rawVal);
      if (isNaN(num)) return;
      // 連續輸入多位數時 (例如想輸入 150，剛按下 1)，若數值尚小於最小門檻則暫不覆寫碰撞，等輸入完成或合規時再套用
      if (id === "prop-w" && !appState.room.lock_scale) {
        if (num < 4) return;
        item.w = num; mode = "scale";
      } else if (id === "prop-d" && !appState.room.lock_scale) {
        if (num < 4) return;
        item.d = num; mode = "scale";
      } else if (id === "prop-h" && !appState.room.lock_scale) {
        if (num < 4) return;
        item.h = Math.min(appState.room.height, num); mode = "scale";
      } else if (id === "prop-seath") {
        if (num < 10) return;
        item.seat_h = Math.min((item.h || 85) - 5, num);
      } else if (id === "prop-x") {
        item.x = num;
      } else if (id === "prop-y") {
        item.y = num;
      } else if (id === "prop-z" && isZAdjustableWallType(item.item_type)) {
        item.z = Math.max(0, num);
      } else if (id === "prop-rot") {
        item.rot = ((num % 360) + 360) % 360;
        document.getElementById("prop-rot-val").innerText = Math.round(item.rot) + "°";
        setInputValueSafe("prop-rot-slider", item.rot);
        mode = "rotate";
      }
    }
    updateSingleItemVisual(item, mode, enforceNow);
  });

  // 當欄位完成輸入 (change / blur) 時，執行完整邊界與留白處防重疊校正、紀錄最近 5 次顏色並重繪
  el.addEventListener("change", (e) => {
    const item = appState.items.find(i => i.id === activeId);
    if (!item) return;
    if (id === "prop-color") pushRecentColor("recent_colors", e.target.value);
    if (id === "prop-border-color") pushRecentColor("recent_border_colors", e.target.value);
    const mode = (id === "prop-w" || id === "prop-d" || id === "prop-h") ? "scale" : (id === "prop-rot" ? "rotate" : "move");
    enforceItemConstraints(item, mode, true);
    updateLeftItemPanel();
    renderFullScene();
    triggerAutoSaveIfChecked();
  });
});

document.getElementById("prop-rot-slider").addEventListener("input", e => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  item.rot = parseFloat(e.target.value) || 0;
  updateSingleItemVisual(item, "rotate");
});

document.getElementById("btn-door-flip-x").addEventListener("click", () => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  item.flip_x = !item.flip_x;
  renderFullScene();
});
document.getElementById("btn-door-flip-y").addEventListener("click", () => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  item.flip_y = !item.flip_y;
  renderFullScene();
});

document.getElementById("prop-scenery-file").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(f) {
    const item = appState.items.find(i => i.id === activeId);
    if (!item) return;
    item.scenery = f.target.result;
    if (renderer) updateThreeScene();
  };
  reader.readAsDataURL(file);
});
document.getElementById("btn-reset-fuji").addEventListener("click", () => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  item.scenery = appState.default_fuji;
  if (renderer) updateThreeScene();
});
// 自動依選取物品生成專屬之 Higgsfield.ai 實景照片主角提取與 3D 材質渲染提示詞
function generateHiggsfieldPromptForItem(item) {
  if (!item) return "";
  const typeMap = {
    furniture: "indoor furniture / cabinet / table",
    chair: "ergonomic chair / seating furniture",
    wall_item: "wall-mounted appliance or frame",
    door: "interior room door panel",
    window: "architectural window frame",
    socket: "wall electrical outlet plate",
    switch: "wall light switch panel"
  };
  const enType = typeMap[item.item_type] || "furniture object";
  const w = Math.round(item.w), d = Math.round(item.d), h = Math.round(item.h || 30);
  return `[Higgsfield.ai 實景主角提取與渲染指令]
請從上傳的現實生活照片中，僅精準鎖定並提取主角「${item.name}」（自動忽略並移除照片內的背景雜物、其他無關物品、牆面與地板），完整保留主角「${item.name}」的真實表面材質、木紋/布料肌理、色澤與結構細節，轉換為可貼合於 ${w}×${d}×${h} cm 模型的正交無縫材質與 3D 渲染圖。
Prompt: Isolate and extract ONLY the main subject [${item.name}, ${enType}] from the uploaded real-life photo. Completely remove all background clutter, surrounding objects, walls, and floor. Reconstruct a clean, studio-lit, orthographic front-and-top texture map and 3D product render of the ${item.name} (${w}x${d}x${h} cm), preserving authentic surface texture, material grain, and color.`;
}

window.copyHiggsfieldPromptAndOpen = function(openSite = false) {
  const promptEl = document.getElementById("prop-higgsfield-prompt");
  if (!promptEl) return;
  const text = promptEl.value.trim();
  if (!text) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    promptEl.select();
    document.execCommand("copy");
  }

  if (openSite) {
    showToast("🚀 已複製主角渲染提示詞，正在開啟 Higgsfield.ai！");
    window.open("https://higgsfield.ai/", "_blank", "noopener");
  } else {
    showToast("📋 已複製 Higgsfield.ai 主角渲染提示詞！");
  }
};

// 實景照片主角自動提取與背景雜物濾除演算法：
// 取樣照片四周邊框作為背景色分布，計算中央主角顯著性 (Saliency + 邊緣梯度)，自動裁切聚焦於照片主角並濾除外圍雜物
function processRealPhotoMainSubject(rawDataUrl, extractEnabled, strengthPct, callback) {
  if (!extractEnabled || strengthPct <= 0) {
    callback(rawDataUrl);
    return;
  }
  const img = new Image();
  img.onload = function() {
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(16, Math.round(img.width * scale));
    const h = Math.max(16, Math.round(img.height * scale));

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. 取樣照片外框邊緣 (8% 邊界) 計算背景平均色與變異範圍
    const borderSamples = [];
    const bw = Math.max(2, Math.floor(w * 0.08));
    const bh = Math.max(2, Math.floor(h * 0.08));
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (x < bw || x >= w - bw || y < bh || y >= h - bh) {
          const idx = (y * w + x) * 4;
          borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
      }
    }

    let bgR = 220, bgG = 220, bgB = 220;
    if (borderSamples.length > 0) {
      let sr = 0, sg = 0, sb = 0;
      borderSamples.forEach(c => { sr += c[0]; sg += c[1]; sb += c[2]; });
      bgR = sr / borderSamples.length;
      bgG = sg / borderSamples.length;
      bgB = sb / borderSamples.length;
    }

    // 2. 偵測畫面中央主角 (Main Subject) 顯著性邊界框並軟化周邊背景雜物
    const strength = Math.max(0.1, Math.min(1.0, strengthPct / 100));
    const colorThresh = 26 + strength * 48;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let fgCount = 0;

    for (let y = 0; y < h; y++) {
      const ny = (y / h - 0.5) * 2;
      for (let x = 0; x < w; x++) {
        const nx = (x / w - 0.5) * 2;
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
        const centerDist = Math.hypot(nx, ny); // 0 at center, ~1.41 at corners
        const centerWeight = Math.max(0.2, 1.18 - centerDist * 0.68);
        const saliency = colorDist * centerWeight;

        if (saliency > colorThresh) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          fgCount++;
        } else if (centerDist > (1.15 - strength * 0.45) && colorDist < colorThresh * 0.95) {
          // 濾除照片外圍非主角之背景雜物，平滑過渡至乾淨柔和基底
          const alphaKeep = Math.max(0.18, 1 - strength * 0.78);
          data[idx] = Math.round(r * alphaKeep + bgR * (1 - alphaKeep));
          data[idx + 1] = Math.round(g * alphaKeep + bgG * (1 - alphaKeep));
          data[idx + 2] = Math.round(b * alphaKeep + bgB * (1 - alphaKeep));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // 3. 自動裁切聚焦至照片主角範圍 (保留適當邊距)
    if (fgCount > w * h * 0.03 && maxX > minX + 12 && maxY > minY + 12) {
      const padX = Math.round((maxX - minX) * 0.06);
      const padY = Math.round((maxY - minY) * 0.06);
      const cx0 = Math.max(0, minX - padX);
      const cy0 = Math.max(0, minY - padY);
      const cw = Math.min(w - cx0, (maxX - minX) + padX * 2);
      const ch = Math.min(h - cy0, (maxY - minY) + padY * 2);

      const outCanvas = document.createElement("canvas");
      outCanvas.width = cw;
      outCanvas.height = ch;
      outCanvas.getContext("2d").drawImage(tempCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
      callback(outCanvas.toDataURL("image/jpeg", 0.9));
    } else {
      callback(tempCanvas.toDataURL("image/jpeg", 0.9));
    }
  };
  img.src = rawDataUrl;
}

function applyItemPhotoSubjectRendering(item) {
  if (!item || !item.raw_photo) return;
  const extractChk = document.getElementById("prop-extract-subject-chk");
  const strengthEl = document.getElementById("prop-extract-strength");
  const extractEnabled = extractChk ? extractChk.checked : true;
  const strengthPct = strengthEl ? (parseFloat(strengthEl.value) || 65) : 65;

  processRealPhotoMainSubject(item.raw_photo, extractEnabled, strengthPct, function(processedUrl) {
    if (typeof textureCache !== "undefined" && item.texture) {
      textureCache.delete(item.texture);
    }
    item.texture = processedUrl;
    renderFullScene();
    triggerAutoSaveIfChecked();
  });
}

document.getElementById("prop-texture-file").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(f) {
    const item = appState.items.find(i => i.id === activeId);
    if (!item) return;
    item.raw_photo = f.target.result;
    applyItemPhotoSubjectRendering(item);
    showToast(`📸 已從實景照片提取主角並渲染至「${item.name}」！`);
  };
  reader.readAsDataURL(file);
});

const extractChkEl = document.getElementById("prop-extract-subject-chk");
if (extractChkEl) {
  extractChkEl.addEventListener("change", () => {
    const item = appState.items.find(i => i.id === activeId);
    if (item && item.raw_photo) applyItemPhotoSubjectRendering(item);
  });
}

const extractStrengthEl = document.getElementById("prop-extract-strength");
if (extractStrengthEl) {
  extractStrengthEl.addEventListener("input", e => {
    const valLbl = document.getElementById("prop-extract-val");
    if (valLbl) valLbl.innerText = e.target.value + "%";
  });
  extractStrengthEl.addEventListener("change", () => {
    const item = appState.items.find(i => i.id === activeId);
    if (item && item.raw_photo) applyItemPhotoSubjectRendering(item);
  });
}

document.getElementById("btn-clear-texture").addEventListener("click", () => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  if (typeof textureCache !== "undefined" && item.texture) {
    textureCache.delete(item.texture);
  }
  item.texture = "";
  item.raw_photo = "";
  document.getElementById("prop-texture-file").value = "";
  renderFullScene();
  triggerAutoSaveIfChecked();
});

window.onNewObjTypeChange = function() {
  const t = document.getElementById("new-obj-type").value;
  const cat = document.getElementById("new-obj-category").value;
  const nameEl = document.getElementById("new-obj-name");
  const wEl = document.getElementById("new-obj-w");
  const dEl = document.getElementById("new-obj-d");
  const hEl = document.getElementById("new-obj-h");
  const seatHEl = document.getElementById("new-obj-seath");
  const seatHRow = document.getElementById("new-obj-seath-row");
  const zEl = document.getElementById("new-obj-z");
  const zRow = document.getElementById("new-obj-z-row");

  zRow.style.display = isZAdjustableWallType(t) ? "flex" : "none";
  seatHRow.style.display = (t === "chair") ? "flex" : "none";

  if (t === "chair") {
    nameEl.value = "椅子"; wEl.value = 50; dEl.value = 50; hEl.value = 85; seatHEl.value = 45; zEl.value = 0;
  } else if (t === "window") {
    nameEl.value = "窗戶"; wEl.value = 120; dEl.value = 12; hEl.value = 130; zEl.value = 85;
  } else if (t === "socket") {
    nameEl.value = "插座"; wEl.value = 22; dEl.value = 12; hEl.value = 14; zEl.value = 30;
  } else if (t === "switch") {
    nameEl.value = "開關"; wEl.value = 22; dEl.value = 12; hEl.value = 14; zEl.value = 110;
  } else if (t === "wall_item") {
    nameEl.value = "壁掛冷氣/掛畫"; wEl.value = 85; dEl.value = 18; hEl.value = 30; zEl.value = 210;
  } else if (t === "door") {
    nameEl.value = "房門"; wEl.value = 90; dEl.value = 14; hEl.value = 210; zEl.value = 0;
  } else {
    if (cat === "床") {
      nameEl.value = "雙人床"; wEl.value = 152; dEl.value = 195; hEl.value = 55; zEl.value = 0;
    } else {
      nameEl.value = "新家具"; wEl.value = 60; dEl.value = 50; hEl.value = 30; zEl.value = 0;
    }
  }
};

window.confirmAddNewObject = function() {
  const chosenCat = document.getElementById("new-obj-category").value || appState.categories[0];
  const type = document.getElementById("new-obj-type").value || "furniture";
  const name = document.getElementById("new-obj-name").value.trim() || "新物件";
  const w = Math.max(4, parseFloat(document.getElementById("new-obj-w").value) || 60);
  const d = Math.max(4, parseFloat(document.getElementById("new-obj-d").value) || 50);
  const h = Math.max(4, Math.min(appState.room.height, parseFloat(document.getElementById("new-obj-h").value) || 30));
  const seatH = type === "chair" ? Math.max(15, Math.min(h - 5, parseFloat(document.getElementById("new-obj-seath").value) || 45)) : 45;
  const z = isZAdjustableWallType(type) ? Math.max(0, parseFloat(document.getElementById("new-obj-z").value) || 0) : 0;

  const colorMap = { window: "#F59E0B", socket: "#F97316", switch: "#0EA5E9", wall_item: "#10B981", door: "#8B5A2B", chair: "#38BDF8", furniture: chosenCat === "床" ? "#FAD785" : "#38BDF8" };
  const newItem = {
    id: "item_" + Date.now(),
    name: name,
    category: type === "chair" && appState.categories.includes("椅子") ? "椅子" : chosenCat,
    item_type: type,
    x: 130, y: ["window", "socket", "switch", "wall_item", "door"].includes(type) ? appState.room.depth : 210, z: z,
    w: w, d: d, h: h, seat_h: seatH, rot: 0,
    color: colorMap[type] || "#38BDF8",
    border_color: getDefaultBorderColorByType(type),
    texture: "",
    scenery: type === "window" ? appState.default_fuji : "",
    flip_x: false, flip_y: false
  };
  expandedCategories.add(newItem.category);
  findNonOverlappingSpot(newItem);
  appState.items.push(newItem);
  activeId = newItem.id;
  renderFullScene();
  selectItemById(newItem.id);
  triggerAutoSaveIfChecked();
};

window.clearWallTexture = function() {
  appState.room.wall_texture = "";
  document.getElementById("wall-texture-file").value = "";
  renderFullScene();
  if (renderer) updateThreeScene();
};

window.clearCeilTexture = function() {
  appState.room.ceiling_texture = "";
  document.getElementById("ceil-texture-file").value = "";
  renderFullScene();
  if (renderer) updateThreeScene();
};

window.deleteSelectedActive = function() {
  if (activeId && activeId !== "HUMAN") deleteItemById(activeId);
};

function deleteItemById(id, evt) {
  if (evt) evt.stopPropagation();
  appState.items = appState.items.filter(i => i.id !== id);
  delete lastValidItemMap[id];
  if (activeId === id) {
    activeId = null;
    if (transformControl) transformControl.detach();
    onObjectDeselected();
  }
  renderFullScene();
  triggerAutoSaveIfChecked();
}

document.getElementById("btn-delete").addEventListener("click", () => {
  if (activeId && activeId !== "HUMAN") deleteItemById(activeId);
});

document.getElementById("btn-duplicate").addEventListener("click", () => {
  const item = appState.items.find(i => i.id === activeId);
  if (!item) return;
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = "item_" + Date.now();
  copy.name = item.name + "(複本)";
  copy.x += 25; copy.y += 25;
  findNonOverlappingSpot(copy);
  appState.items.push(copy);
  activeId = copy.id;
  renderFullScene();
  selectItemById(copy.id);
});

document.getElementById("room-editable-lock").addEventListener("change", function(e) {
  appState.room.editable = e.target.checked;
  renderVoidListUI();
  renderFullScene();
});

function renderVoidListUI() {
  const container = document.getElementById("void-list-container");
  container.innerHTML = "";
  const disabledAttr = appState.room.editable ? "" : "disabled";

  appState.voids.forEach((v, idx) => {
    const card = document.createElement("div");
    card.style.cssText = "background:#1F232B; border:1px solid #334155; border-radius:6px; padding:7px; margin-bottom:5px; display:flex; flex-direction:column; gap:5px;";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
        <input type="text" value="${v.name}" ${disabledAttr} oninput="updateVoidField(${idx}, 'name', this.value)" style="font-weight:600;">
        <button class="danger" ${disabledAttr} onclick="deleteVoidArea(${idx})" style="padding:3px 6px; font-size:11px; flex-shrink:0;">🗑️</button>
      </div>
      <div class="field-row">
        <div><span style="font-size:10px;color:#94A3B8;">寬 W</span><input type="number" value="${Math.round(v.w)}" ${disabledAttr} oninput="updateVoidField(${idx}, 'w', this.value)"></div>
        <div><span style="font-size:10px;color:#94A3B8;">深 D</span><input type="number" value="${Math.round(v.d)}" ${disabledAttr} oninput="updateVoidField(${idx}, 'd', this.value)"></div>
        <div><span style="font-size:10px;color:#94A3B8;">X 坐標</span><input type="number" value="${Math.round(v.x)}" ${disabledAttr} oninput="updateVoidField(${idx}, 'x', this.value)"></div>
        <div><span style="font-size:10px;color:#94A3B8;">Y 坐標</span><input type="number" value="${Math.round(v.y)}" ${disabledAttr} oninput="updateVoidField(${idx}, 'y', this.value)"></div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.updateVoidField = function(idx, field, val) {
  if (!appState.voids[idx]) return;
  if (field === 'name') appState.voids[idx].name = val;
  else {
    if (val === "" || val === "-") return;
    appState.voids[idx][field] = parseFloat(val) || 0;
  }
  appState.items.forEach(it => enforceItemConstraints(it, "move", false));
  renderFullScene();
  triggerAutoSaveIfChecked();
};

window.addVoidArea = function() {
  if (!appState.room.editable) {
    alert("💡 請先勾選上方「🔓 勾選才可拖曳/改動留白處」！");
    return;
  }
  appState.voids.push({ id: "void_" + Date.now(), name: `留白處 ${appState.voids.length + 1}`, x: 50, y: 50, w: 80, d: 80 });
  renderVoidListUI();
  renderFullScene();
};

window.deleteVoidArea = function(idx) {
  appState.voids.splice(idx, 1);
  renderVoidListUI();
  renderFullScene();
};

function initRoomFormValues() {
  document.getElementById("room-editable-lock").checked = !!appState.room.editable;
  setInputValueSafe("room-w", appState.room.width);
  setInputValueSafe("room-d", appState.room.depth);
  setInputValueSafe("room-h", appState.room.height);
  document.getElementById("room-show-walls").checked = !!appState.room.show_walls;
  document.getElementById("room-show-ceiling").checked = !!appState.room.show_ceiling;
  setInputValueSafe("room-wall-color", appState.room.wall_color || "#F8FAFC");
  setInputValueSafe("room-ceil-color", appState.room.ceiling_color || "#FFFFFF");

  document.getElementById("compass-show").checked = appState.compass.show;
  document.getElementById("compass-auto-center").checked = !!appState.compass.auto_center;
  setInputValueSafe("compass-x", appState.compass.x);
  setInputValueSafe("compass-y", appState.compass.y);
  setInputValueSafe("compass-rot", appState.compass.rotation || 0);
  setInputValueSafe("compass-rot-slider", appState.compass.rotation || 0);
  document.getElementById("compass-rot-val").innerText = (appState.compass.rotation || 0) + "°";

  document.getElementById("feixing-show").checked = !!appState.compass.show_feixing;
  setInputValueSafe("feixing-year", appState.compass.feixing_year || 2026);
}

function syncRoomFromInputs(e) {
  if (e && (e.target.value === "" || e.target.value === "-")) return;
  const targetId = e ? e.target.id : "";

  appState.room.width = parseFloat(document.getElementById("room-w").value) || 400;
  appState.room.depth = parseFloat(document.getElementById("room-d").value) || 300;
  appState.room.height = parseFloat(document.getElementById("room-h").value) || 280;
  appState.room.show_walls = document.getElementById("room-show-walls").checked;
  appState.room.show_ceiling = document.getElementById("room-show-ceiling").checked;
  appState.room.wall_color = document.getElementById("room-wall-color").value;
  appState.room.ceiling_color = document.getElementById("room-ceil-color").value;

  appState.compass.show = document.getElementById("compass-show").checked;
  appState.compass.auto_center = document.getElementById("compass-auto-center").checked;

  if (targetId === "compass-x" || targetId === "compass-y") {
    appState.compass.auto_center = false;
    document.getElementById("compass-auto-center").checked = false;
    appState.compass.x = parseFloat(document.getElementById("compass-x").value) || 200;
    appState.compass.y = parseFloat(document.getElementById("compass-y").value) || 150;
  } else if (appState.compass.auto_center || targetId === "room-w" || targetId === "room-d") {
    appState.compass.x = Math.round(appState.room.width / 2);
    appState.compass.y = Math.round(appState.room.depth / 2);
    setInputValueSafe("compass-x", appState.compass.x);
    setInputValueSafe("compass-y", appState.compass.y);
  }

  appState.compass.rotation = parseFloat(document.getElementById("compass-rot").value) || 0;
  setInputValueSafe("compass-rot-slider", appState.compass.rotation);
  document.getElementById("compass-rot-val").innerText = appState.compass.rotation + "°";

  appState.compass.show_feixing = document.getElementById("feixing-show").checked;
  appState.compass.feixing_year = parseInt(document.getElementById("feixing-year").value) || 2026;

  appState.items.forEach(it => enforceItemConstraints(it, "move", false));
  renderFullScene();
}

document.querySelectorAll(".live-room-input").forEach(el => {
  el.addEventListener("input", syncRoomFromInputs);
});
document.getElementById("compass-rot-slider").addEventListener("input", e => {
  document.getElementById("compass-rot").value = e.target.value;
  syncRoomFromInputs();
});

document.getElementById("wall-texture-file").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(f) {
    appState.room.wall_texture = f.target.result;
    if (renderer) updateThreeScene();
  };
  reader.readAsDataURL(file);
});
document.getElementById("ceil-texture-file").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(f) {
    appState.room.ceiling_texture = f.target.result;
    appState.room.show_ceiling = true;
    document.getElementById("room-show-ceiling").checked = true;
    if (renderer) updateThreeScene();
  };
  reader.readAsDataURL(file);
});

window.toggleLockHorizFPV = function() {
  appState.human.lock_horizontal = !appState.human.lock_horizontal;
  if (appState.human.lock_horizontal) {
    appState.human.pitch = 0;
  }
  initHumanFormValues();
  if (currentMode === "FPV") syncFPVCamera();
};

document.getElementById("human-lock-horiz").addEventListener("change", e => {
  appState.human.lock_horizontal = e.target.checked;
  if (appState.human.lock_horizontal) {
    appState.human.pitch = 0;
  }
  initHumanFormValues();
  if (currentMode === "FPV") syncFPVCamera();
});

function initHumanFormValues() {
  const h = appState.human;
  const eyeH = getHumanEyeHeight();
  const lockH = !!h.lock_horizontal;

  document.getElementById("human-lock-horiz").checked = lockH;
  const hudLockBtn = document.getElementById("hud-btn-lock-h");
  if (hudLockBtn) {
    hudLockBtn.innerText = lockH ? "🔒水平" : "🔓自由";
    hudLockBtn.classList.toggle("active", lockH);
  }
  document.getElementById("human-pitch-slider").disabled = lockH;
  document.getElementById("human-pitch").disabled = lockH;
  document.getElementById("hud-pitch-slider").disabled = lockH;

  setInputValueSafe("human-fov-h", h.fov_h || 100);
  setInputValueSafe("human-fov-up", h.fov_up || 50);
  setInputValueSafe("human-fov-down", h.fov_down || 65);
  const hudFovLbl = document.getElementById("hud-fov-lbl");
  if (hudFovLbl) hudFovLbl.innerText = `視野:${h.fov_h || 100}°(上${h.fov_up || 50}/下${h.fov_down || 65})`;

  setInputValueSafe("human-height", h.height || 178);
  setInputValueSafe("human-x", Math.round(h.x));
  setInputValueSafe("human-y", Math.round(h.y));
  setInputValueSafe("human-rot", Math.round(h.rot || 0));
  setInputValueSafe("human-rot-slider", Math.round(h.rot || 0));
  document.getElementById("human-rot-val").innerText = Math.round(h.rot || 0) + "°";

  const maxUp = h.fov_up || 50;
  const maxDown = -(h.fov_down || 65);
  document.getElementById("human-pitch-slider").max = maxUp;
  document.getElementById("human-pitch-slider").min = maxDown;
  document.getElementById("hud-pitch-slider").max = maxUp;
  document.getElementById("hud-pitch-slider").min = maxDown;

  setInputValueSafe("human-pitch", Math.round(h.pitch || 0));
  setInputValueSafe("human-pitch-slider", Math.round(h.pitch || 0));
  setInputValueSafe("hud-pitch-slider", Math.round(h.pitch || 0));
  document.getElementById("human-pitch-val").innerText = Math.round(h.pitch || 0) + "°";
  document.getElementById("hud-pitch-lbl").innerText = Math.round(h.pitch || 0) + "°";

  const p = h.posture || "stand";
  let surfaceDesc = "";
  if (p === "sit") {
    surfaceDesc = ` (臀高:${h.seat_h || 45}cm/腳著地)`;
  } else if (h.z > 0) {
    const chk = checkHumanWalkable(h.x, h.y);
    if (chk.steppedItem && isChairItem(chk.steppedItem)) {
      surfaceDesc = ` (站於「${chk.steppedItem.name}」椅墊上)`;
    } else if (chk.steppedItem) {
      surfaceDesc = ` (站於「${chk.steppedItem.name}」上)`;
    } else {
      surfaceDesc = " (踏於物件上)";
    }
  }
  document.getElementById("human-eye-info").innerText = `眼高: ${eyeH} cm`;
  document.getElementById("human-basez-info").innerText = `踏面Z: ${Math.round(h.z || 0)} cm${surfaceDesc}`;
  const hudEyeLbl = document.getElementById("hud-eye-height-lbl");
  if (hudEyeLbl) hudEyeLbl.innerText = `眼高:${eyeH}cm`;

  document.getElementById("sit-options-box").style.display = "flex";
  const hudSitBar = document.getElementById("hud-sit-bar");
  if (hudSitBar) hudSitBar.style.display = "flex";

  document.getElementById("btn-sit-bed-edge").classList.toggle("active", p === "sit" && h.sit_mode === "bed_edge");
  document.getElementById("btn-sit-on-chair").classList.toggle("active", p === "sit" && h.sit_mode === "chair");

  ["stand", "sit", "lie"].forEach(mode => {
    const b1 = document.getElementById("btn-posture-" + mode);
    const b2 = document.getElementById("hud-btn-" + mode);
    if (b1) b1.classList.toggle("active", p === mode);
    if (b2) b2.classList.toggle("active", p === mode);
  });
}

["human-fov-h", "human-fov-up", "human-fov-down", "human-height", "human-x", "human-y", "human-rot", "human-pitch"].forEach(id => {
  document.getElementById(id).addEventListener("input", e => {
    if (e.target.value === "" || e.target.value === "-") return;
    const val = parseFloat(e.target.value) || 0;
    if (id === "human-fov-h") appState.human.fov_h = Math.max(30, Math.min(165, val));
    if (id === "human-fov-up") appState.human.fov_up = Math.max(10, Math.min(85, val));
    if (id === "human-fov-down") appState.human.fov_down = Math.max(10, Math.min(85, val));
    if (id === "human-height") appState.human.height = Math.max(60, val);
    if (id === "human-x") tryMoveHumanTo(val, appState.human.y, true);
    if (id === "human-y") tryMoveHumanTo(appState.human.x, val, true);
    if (id === "human-rot") appState.human.rot = ((val % 360) + 360) % 360;
    if (id === "human-pitch" && !appState.human.lock_horizontal) {
      appState.human.pitch = Math.max(-(appState.human.fov_down || 65), Math.min(appState.human.fov_up || 50, val));
    }
    initHumanFormValues();
    renderFullScene();
    if (currentMode === "FPV") syncFPVCamera();
  });
});

document.getElementById("human-rot-slider").addEventListener("input", e => {
  appState.human.rot = parseFloat(e.target.value) || 0;
  initHumanFormValues();
  renderFullScene();
  if (currentMode === "FPV") syncFPVCamera();
});

document.getElementById("human-pitch-slider").addEventListener("input", e => {
  if (appState.human.lock_horizontal) return;
  appState.human.pitch = parseFloat(e.target.value) || 0;
  initHumanFormValues();
  if (currentMode === "FPV") syncFPVCamera();
});

document.getElementById("hud-pitch-slider").addEventListener("input", e => {
  if (appState.human.lock_horizontal) return;
  appState.human.pitch = parseFloat(e.target.value) || 0;
  initHumanFormValues();
  if (currentMode === "FPV") syncFPVCamera();
});

window.setHumanPosture = function(p) {
  const prevPosture = appState.human.posture;
  const prevSitMode = appState.human.sit_mode;
  appState.human.posture = p;

  if (p === "sit") {
    renderChairSelectOptions();
    if (appState.human.sit_mode === "chair") {
      window.sitOnSelectedChair();
      return;
    } else {
      window.sitAtBedEdge();
      return;
    }
  }

  // 若從「坐下」切換為「站立」：優先嘗試於面向前方地板自然站起，若前方為書桌或矮物亦可直接踏上或微退站立，絕不卡住
  if (p === "stand" && prevPosture === "sit") {
    const yawRad = (appState.human.rot || 0) * Math.PI / 180;
    const fx = Math.sin(yawRad), fy = -Math.cos(yawRad);
    // 嘗試往椅子/床沿前方地板站起，或往側邊空地站起，使站起後預設踩在地面 (baseZ = 0)
    const tryOffsets = [22, 34, -28];
    for (let i = 0; i < tryOffsets.length; i++) {
      const tx = Math.round(appState.human.x + fx * tryOffsets[i]);
      const ty = Math.round(appState.human.y + fy * tryOffsets[i]);
      const chk = checkHumanWalkable(tx, ty);
      if (chk.allowed && chk.baseZ === 0) {
        appState.human.x = tx;
        appState.human.y = ty;
        break;
      }
    }
  }

  if (!appState.human.lock_horizontal) {
    if (p === "lie") {
      appState.human.pitch = 35;
      appState.room.show_ceiling = true;
      document.getElementById("room-show-ceiling").checked = true;
    } else {
      appState.human.pitch = 0;
    }
  }
  const check = checkHumanWalkable(appState.human.x, appState.human.y);
  appState.human.z = check.baseZ;
  initHumanFormValues();
  renderFullScene();
  if (currentMode === "FPV") syncFPVCamera();
  triggerAutoSaveIfChecked();
};

window.placeHumanOnBed = function(targetPosture = 'lie') {
  if (targetPosture === "sit") {
    window.sitAtBedEdge();
    enterHumanFPV();
    return;
  }
  const bed = appState.items.find(i => isBedItem(i));
  if (bed) {
    appState.human.x = Math.round(bed.x + bed.w / 2);
    appState.human.y = Math.round(bed.y + bed.d * 0.35);
    appState.human.z = (bed.z || 0) + (bed.h || 55);
    appState.human.rot = 180;
  }
  setHumanPosture(targetPosture);
  enterHumanFPV();
};

function renderRightPanel() {
  const container = document.getElementById("item-list-container");
  document.getElementById("obj-count").innerText = `共 ${appState.items.length} 項`;
  container.innerHTML = "";

  const badgeMap = {
    furniture: { text: "家具", cls: "" },
    chair: { text: "🪑 椅子", cls: "win" },
    wall_item: { text: "🖼️ 牆物", cls: "win" },
    door: { text: "🚪 門", cls: "door" },
    window: { text: "🪟 窗", cls: "win" },
    socket: { text: "🔌 插座", cls: "win" },
    switch: { text: "💡 開關", cls: "win" }
  };

  appState.categories.forEach(cat => {
    const catItems = appState.items.filter(it => (it.category || appState.categories[0]) === cat);
    const sec = document.createElement("div");
    sec.className = "cat-section";
    sec.setAttribute("data-cat", cat);

    sec.addEventListener("dragover", e => {
      e.preventDefault();
      sec.classList.add("drag-over");
    });
    sec.addEventListener("dragleave", () => sec.classList.remove("drag-over"));
    sec.addEventListener("drop", e => {
      e.preventDefault();
      sec.classList.remove("drag-over");
      if (draggedItemId) moveItemToCategory(draggedItemId, cat);
    });

    const isExpanded = expandedCategories.has(cat);
    const header = document.createElement("div");
    header.className = "cat-header";
    header.innerHTML = `<span>${isExpanded ? '📂' : '📁'} ${cat} ${cat === '床' ? '🛏️' : (cat === '椅子' ? '🪑' : '')}</span><span style="font-size:11px;color:#64748B;">${catItems.length} 項 ${isExpanded ? '▾' : '▸'}</span>`;

    const listBox = document.createElement("div");
    listBox.className = "cat-items";
    listBox.style.display = isExpanded ? "flex" : "none";

    header.onclick = () => {
      if (expandedCategories.has(cat)) expandedCategories.delete(cat);
      else expandedCategories.add(cat);
      renderRightPanel();
    };

    catItems.forEach(item => {
      const card = document.createElement("div");
      card.className = "item-card" + (item.id === activeId ? " selected" : "");
      card.setAttribute("data-item-id", item.id);
      card.draggable = true;
      card.onclick = () => selectItemById(item.id);

      card.addEventListener("dragstart", e => {
        draggedItemId = item.id;
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", item.id);
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        draggedItemId = null;
        document.querySelectorAll(".cat-section").forEach(s => s.classList.remove("drag-over"));
      });

      let touchTimer = null;
      let isTouchDraggingCard = false;
      card.addEventListener("touchstart", e => {
        touchTimer = setTimeout(() => {
          isTouchDraggingCard = true;
          draggedItemId = item.id;
          card.classList.add("dragging");
        }, 280);
      }, { passive: true });

      card.addEventListener("touchmove", e => {
        if (!isTouchDraggingCard) { clearTimeout(touchTimer); return; }
        e.preventDefault();
        const t = e.touches[0];
        const elUnder = document.elementFromPoint(t.clientX, t.clientY);
        document.querySelectorAll(".cat-section").forEach(s => s.classList.remove("drag-over"));
        const targetSec = elUnder ? elUnder.closest(".cat-section") : null;
        if (targetSec) targetSec.classList.add("drag-over");
      }, { passive: false });

      card.addEventListener("touchend", e => {
        clearTimeout(touchTimer);
        if (!isTouchDraggingCard) return;
        isTouchDraggingCard = false;
        card.classList.remove("dragging");
        const t = e.changedTouches[0];
        const elUnder = document.elementFromPoint(t.clientX, t.clientY);
        const targetSec = elUnder ? elUnder.closest(".cat-section") : null;
        document.querySelectorAll(".cat-section").forEach(s => s.classList.remove("drag-over"));
        if (targetSec && targetSec.getAttribute("data-cat")) {
          moveItemToCategory(item.id, targetSec.getAttribute("data-cat"));
        }
        draggedItemId = null;
      });

      const b = badgeMap[item.item_type || "furniture"] || badgeMap.furniture;
      const seatInfo = item.item_type === "chair" ? ` | 坐墊:${item.seat_h || 45}cm` : "";
      card.innerHTML = `
        <div class="item-card-header">
          <div class="name">
            <span style="color:#64748B;font-size:11px;cursor:grab;">⠿</span>
            <span class="item-color-swatch" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${item.color};border:1px solid #fff;"></span>
            <span class="item-name-text">${item.name}</span>
            <span class="badge ${b.cls}">${b.text}</span>
          </div>
          <div style="display:flex; gap:2px; align-items:center;">
            <button class="card-del-btn" title="複製此物件 (Ctrl+C)" onclick="copySelectedItem('${item.id}', event)">📋</button>
            <button class="card-del-btn" title="刪除" onclick="deleteItemById('${item.id}', event)">🗑️</button>
          </div>
        </div>
        <div class="dims">
          ${Math.round(item.w)}×${Math.round(item.d)}×${item.h || 30}${seatInfo} | ${item.rot || 0}°
        </div>
      `;
      listBox.appendChild(card);
    });

    sec.appendChild(header);
    sec.appendChild(listBox);
    container.appendChild(sec);
  });
}

function highlightRightPanel() {
  const container = document.getElementById("item-list-container");
  if (!container || !container.children.length) {
    renderRightPanel();
    return;
  }
  // 局部更新選取樣式與尺寸文字，避免每次選取或拖曳都銷毀重建整個右側 DOM 樹
  container.querySelectorAll(".item-card").forEach(card => {
    const cid = card.getAttribute("data-item-id");
    card.classList.toggle("selected", cid === activeId);
    if (cid === activeId) {
      const it = appState.items.find(i => i.id === cid);
      if (it) {
        const nameEl = card.querySelector(".item-name-text");
        const swatchEl = card.querySelector(".item-color-swatch");
        const dimsEl = card.querySelector(".dims");
        if (nameEl) nameEl.textContent = it.name;
        if (swatchEl) swatchEl.style.background = it.color;
        if (dimsEl) {
          const seatInfo = it.item_type === "chair" ? ` | 坐墊:${it.seat_h || 45}cm` : "";
          dimsEl.textContent = `${Math.round(it.w)}×${Math.round(it.d)}×${it.h || 30}${seatInfo} | ${it.rot || 0}°`;
        }
      }
    }
  });
}

function selectItemById(id) {
  activeId = id;
  isRenderingScene = true;
  try {
    if (currentMode === "2D" && canvas) {
      const group = canvas.getObjects().find(o => o.itemId === id);
      if (group && !forcePanMode) {
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
      }
    } else if (currentMode === "3D" && transformControl) {
      const mesh = selectable3DMeshes.find(m => m.userData.itemId === id);
      if (mesh) attachGizmoWithRules(mesh);
    }
  } finally {
    isRenderingScene = false;
  }
  switchLeftTab('item');
  setFoldSectionOpen('fold-sec-edit', true);
  updateLeftItemPanel();
  highlightRightPanel();
}

function zoomToFit() {
  if (!canvas) return;
  const rw = appState.room.width, rd = appState.room.depth;
  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth - 90, ch = container.clientHeight - 90;
  const scale = Math.min(cw / rw, ch / rd, 1.65);
  const offsetX = (container.clientWidth - rw * scale) / 2;
  const offsetY = (container.clientHeight - rd * scale) / 2;
  canvas.setViewportTransform([scale, 0, 0, scale, offsetX, offsetY]);
  canvas.requestRenderAll();
}

document.getElementById("btn-zoom-fit").addEventListener("click", zoomToFit);
document.getElementById("btn-zoom-in").addEventListener("click", () => canvas.setZoom(Math.min(canvas.getZoom() * 1.2, 5)));
document.getElementById("btn-zoom-out").addEventListener("click", () => canvas.setZoom(Math.max(canvas.getZoom() / 1.2, 0.2)));
document.getElementById("btn-pan-toggle").addEventListener("click", function() {
  forcePanMode = !forcePanMode;
  this.innerText = forcePanMode ? "✋ 平移: 開" : "✋ 平移: 關";
  this.classList.toggle("active", forcePanMode);
  renderFullScene();
});

document.getElementById("btn-save-local").addEventListener("click", () => {
  saveStateToLocal(true);
});

document.getElementById("btn-load-local").addEventListener("click", () => {
  const saved = localStorage.getItem("room_planner_v9") || localStorage.getItem("room_planner_v8") || localStorage.getItem("room_planner_v7");
  if (saved) {
    appState = normalizeAppState(JSON.parse(saved));
    const autoSaveChk = document.getElementById("auto-save-chk");
    if (autoSaveChk) autoSaveChk.checked = !!appState.room.auto_save;
    appState.items.forEach(it => saveValidItemBackup(it));
    renderCategoryUI();
    renderRecentColorSwatches();
    renderChairSelectOptions();
    initRoomFormValues();
    initHumanFormValues();
    syncLockScaleUI();
    renderVoidListUI();
    renderFullScene();
    zoomToFit();
    showToast("📂 已成功載入上次儲存的設計！");
  } else {
    alert("⚠️ 尚未找到本地存檔紀錄！");
  }
});

document.getElementById("btn-export-file").addEventListener("click", () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", "room_design_" + new Date().toISOString().slice(0, 10) + ".json");
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.getElementById("file-import").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      appState = normalizeAppState(JSON.parse(evt.target.result));
      const autoSaveChk = document.getElementById("auto-save-chk");
      if (autoSaveChk) autoSaveChk.checked = !!appState.room.auto_save;
      appState.items.forEach(it => saveValidItemBackup(it));
      renderCategoryUI();
      renderRecentColorSwatches();
      renderChairSelectOptions();
      initRoomFormValues();
      initHumanFormValues();
      syncLockScaleUI();
      renderVoidListUI();
      renderFullScene();
      zoomToFit();
      triggerAutoSaveIfChecked();
      showToast("✅ 專案檔案載入成功！");
    } catch(err) {
      alert("❌ 檔案格式錯誤！");
    }
  };
  reader.readAsText(file);
});

document.getElementById("btn-reset-default").addEventListener("click", () => {
  if (confirm("確定要重置回附圖原始預設配置嗎？")) {
    const keepAutoSave = appState.room ? !!appState.room.auto_save : false;
    appState = normalizeAppState(INITIAL_CONFIG);
    appState.room.auto_save = keepAutoSave;
    appState.items.forEach(it => saveValidItemBackup(it));
    renderCategoryUI();
    renderRecentColorSwatches();
    renderChairSelectOptions();
    initRoomFormValues();
    initHumanFormValues();
    syncLockScaleUI();
    renderVoidListUI();
    renderFullScene();
    zoomToFit();
    triggerAutoSaveIfChecked();
  }
});

function initPanelResizers() {
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  const leftResizer = document.getElementById("left-resizer");
  const rightResizer = document.getElementById("right-resizer");

  let resizingSide = null;

  const startResize = (side, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizingSide = side;
  };

  if (leftResizer) leftResizer.addEventListener("pointerdown", e => startResize("left", e));
  if (rightResizer) rightResizer.addEventListener("pointerdown", e => startResize("right", e));

  window.addEventListener("pointermove", e => {
    if (!resizingSide) return;
    if (resizingSide === "left") {
      const newW = Math.max(145, Math.min(window.innerWidth * 0.88, e.clientX));
      leftPanel.style.width = newW + "px";
    } else if (resizingSide === "right") {
      const newW = Math.max(145, Math.min(window.innerWidth * 0.88, window.innerWidth - e.clientX));
      rightPanel.style.width = newW + "px";
    }
    window.dispatchEvent(new Event("resize"));
  });

  window.addEventListener("pointerup", () => {
    resizingSide = null;
  });

  // 僅於小螢幕行動裝置且非連續數字輸入時提供溫和捲動，避免輸入框打字時畫面跳動失焦
  if (window.innerWidth <= 768) {
    document.querySelectorAll("input[type='text'], select").forEach(el => {
      el.addEventListener("focus", () => {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 250);
      });
    });
  }

  const newCatSel = document.getElementById("new-obj-category");
  if (newCatSel) newCatSel.addEventListener("change", window.onNewObjTypeChange);
}

window.toggleMinimizeFPVHud = function() {
  const hud = document.getElementById("fpv-hud");
  const btn = document.getElementById("btn-fpv-min");
  hud.classList.toggle("minimized");
  btn.innerText = hud.classList.contains("minimized") ? "□" : "—";
};

function initFPVHudDragAndResize() {
  const hud = document.getElementById("fpv-hud");
  const dragBar = document.getElementById("fpv-hud-drag");
  const resizer = document.getElementById("fpv-hud-resizer");
  if (!hud || !dragBar || !resizer) return;

  let isDraggingHud = false;
  let isResizingHud = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;
  let currentScale = 1.0;
  let startScale = 1.0;

  dragBar.addEventListener("pointerdown", e => {
    if (e.target.tagName.toLowerCase() === "button") return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingHud = true;
    const rect = hud.getBoundingClientRect();
    const parentRect = hud.parentElement.getBoundingClientRect();
    origLeft = rect.left - parentRect.left;
    origTop = rect.top - parentRect.top;
    hud.style.left = origLeft + "px";
    hud.style.top = origTop + "px";
    hud.style.right = "auto";
    hud.style.bottom = "auto";
    startX = e.clientX;
    startY = e.clientY;
  });

  resizer.addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();
    isResizingHud = true;
    startX = e.clientX;
    startY = e.clientY;
    startScale = currentScale;
  });

  window.addEventListener("pointermove", e => {
    if (isDraggingHud) {
      const parentRect = hud.parentElement.getBoundingClientRect();
      let nx = origLeft + (e.clientX - startX);
      let ny = origTop + (e.clientY - startY);
      nx = Math.max(4, Math.min(parentRect.width - 90, nx));
      ny = Math.max(48, Math.min(parentRect.height - 60, ny));
      hud.style.left = nx + "px";
      hud.style.top = ny + "px";
    } else if (isResizingHud) {
      const delta = (e.clientX - startX + e.clientY - startY) * 0.004;
      currentScale = Math.max(0.55, Math.min(1.35, startScale + delta));
      hud.style.transform = `scale(${currentScale})`;
    }
  });

  window.addEventListener("pointerup", () => {
    isDraggingHud = false;
    isResizingHud = false;
  });
}