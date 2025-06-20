window.addEventListener('load', () => {
    const canvas = document.getElementById('floorPlanCanvas');
    const ctx = canvas.getContext('2d');
    const header = document.getElementById('pageHeader');
    const canvasPanel = document.getElementById('canvasPanel');
    const toolbar = document.getElementById('toolbar');
   const addFloorBtn = document.getElementById('addFloorBtn');
    const renameFloorBtn = document.getElementById('renameFloorBtn');
    const deleteFloorBtn = document.getElementById('deleteFloorBtn');
    const floorList = document.getElementById('floorList');
    const deleteBtn = document.getElementById('deleteBtn');
    const distributorList = document.getElementById('distributorList');
    const deleteDistributorBtn = document.getElementById('deleteDistributorBtn');
    const drawWallBtn = document.getElementById('drawWallBtn');
    const selectBtn = document.getElementById('selectBtn');
    const drawZoneBtn = document.getElementById('drawZoneBtn');
    const addDistributorBtn = document.getElementById('addDistributorBtn');
    const addDoorBtn = document.getElementById('addDoorBtn');
    const editDistributorBtn = document.getElementById('editDistributorBtn');
    const panBtn = document.getElementById('panBtn');
    const centerBtn = document.getElementById('centerBtn');
    const clearBtn = document.getElementById('clearBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const generatePipesBtn = document.getElementById('generatePipesBtn');
    const manualPipeBtn = document.getElementById('manualPipeBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const importPlanBtn = document.getElementById('importPlanBtn');
    const planImageInput = document.getElementById('planImageInput');
    const planDialog = document.getElementById('planDialog');
    const planOpacity = document.getElementById('planOpacity');
    const setPlanRefBtn = document.getElementById('setPlanRefBtn');
    const closePlanDialog = document.getElementById('closePlanDialog');
    const fixWallsBtn = document.getElementById('fixWallsBtn');
    const layerPanel = document.getElementById('layerPanel');
    const spacingInput = document.getElementById('pipeSpacing');
    const lengthInput = document.getElementById('lineLength');
    const wallThicknessInput = document.getElementById('wallThickness');
    const lengthBox = document.getElementById('lengthBox');
    const helpOverlay = document.getElementById('helpOverlay');
    let ilpWorker = null;
    try {
        ilpWorker = new Worker('js/ilp-worker.js');
        ilpWorker.onerror = () => {
            console.warn('ILP worker failed, falling back to A*');
            ilpWorker = null;
        };
    } catch (err) {
        console.warn('ILP worker could not be started:', err);
        ilpWorker = null;
    }

    const toolButtons = {};

    Object.assign(toolButtons, {
        wall: drawWallBtn,
        zone: drawZoneBtn,
        distributor: addDistributorBtn,
        door: addDoorBtn,
        select: selectBtn,
        pan: panBtn,
        pipe: manualPipeBtn
    });

    const layers = {
        walls: {visible: true, locked: false},
        zones: {visible: true, locked: false},
        distributors: {visible: true, locked: false},
        pipes: {visible: true, locked: false},
        guides: {visible: true, locked: false}
    };

    let gridSize = 38; // grid spacing in pixels (0.5 m)
    let pipeGrid = gridSize / 4; // finer grid for manual pipes
    const SNAP_DIST = 10;
    const PARALLEL_OFFSET = 6;
    const PORT_SPACING = PARALLEL_OFFSET * 2; // spacing between pipe pairs on distributors
    let pixelsPerMeter = gridSize * 2; // 0.5 m per grid square
    let pipeDiameter = 0.02 * pixelsPerMeter; // ~20 mm
    let scale = 1;
    let defaultWallThickness = 0.25 * pixelsPerMeter;
    let entryClearance = 0.15 * pixelsPerMeter; // keep pipes ~15cm from walls
    const MAX_CIRCUIT_LENGTH = 120; // metres
    let offsetX = 0;
    let offsetY = 0;
    let floors = [];
    let currentFloor = null;
    let mode = null;
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let wallStart = null; // last point when drawing consecutive walls
    let mouseWorld = { x: 0, y: 0 }; // track mouse position for previews
    let selectedWall = null;
    let selectedZone = null;
    let selectedDistributor = null;
    let selectedPipe = null;
    let selectedDoor = null;
    let dragMode = null; // move, end1, end2, moveZone/distributor/moveDoor
    let zoneDrawing = null; // array of points while creating a zone
    let pipeDrawing = null; // current manual pipe path
    let typedLength = '';
    let settingPlanRef = false;
    let planRefPoints = [];

    // history for undo/redo
    let history = [];
    let historyIndex = -1;
    let historyPending = false;

    function scheduleHistory() {
        historyPending = true;
    }

    function pushHistoryNow() {
        const currentIndex = floors.indexOf(currentFloor);
        const snapshot = JSON.stringify({ floors, currentIndex });
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(snapshot);
        if (history.length > 200) {
            history.shift();
        } else {
            historyIndex++;
        }
        historyPending = false;
    }

    function loadHistory(index) {
        if (index < 0 || index >= history.length) return;
        const data = JSON.parse(history[index]);
        floors = data.floors;
        currentFloor = floors[data.currentIndex] || floors[0] || null;
        updateFloorList();
        updateDistributorList();
        drawAll();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            loadHistory(historyIndex);
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            loadHistory(historyIndex);
        }
    }

    function setMode(m) {
        if (m === 'wall' && layers.walls.locked) return;
        if (m === 'zone' && layers.zones.locked) return;
        if (m === 'distributor' && layers.distributors.locked) return;
        if (m === 'pipe' && layers.pipes.locked) return;
        mode = m;
        Object.values(toolButtons).forEach(btn => btn.classList.remove('active'));
        if (toolButtons[m]) toolButtons[m].classList.add('active');
    }

    function resizeCanvas() {
        canvas.width = canvasPanel.clientWidth;
        const bodyStyles = getComputedStyle(document.body);
        const paddingY = parseFloat(bodyStyles.paddingTop) + parseFloat(bodyStyles.paddingBottom);
        const h = window.innerHeight - header.offsetHeight - toolbar.offsetHeight - paddingY;
        canvas.height = h > 0 ? h : 300;
        drawAll();
    }

    window.addEventListener('resize', resizeCanvas);

    function addFloor(name) {
        floors.push({
            name,
            walls: [],
            zones: [],
            distributors: [],
            pipes: [],
            background: {image:null, offsetX:0, offsetY:0, scale:1, rotation:0, opacity:0.5}
        });
        currentFloor = floors[floors.length - 1];
        updateFloorList();
        updateDistributorList();
    }

    function updateFloorList() {
        floorList.innerHTML = '';
        floors.forEach((f, idx) => {
            const li = document.createElement('li');
            li.textContent = f.name;
            if (f === currentFloor) li.classList.add('selected');
            li.addEventListener('click', () => {
                currentFloor = f;
                selectedWall = null;
                selectedZone = null;
                selectedDistributor = null;
                selectedPipe = null;
                updateFloorList();
                updateDistributorList();
                drawAll();
            });
            li.addEventListener('dblclick', () => {
                const n = prompt('Floor name?', f.name);
                if (n) {
                    f.name = n;
                    updateFloorList();
                    scheduleHistory();
                }
            });
            floorList.appendChild(li);
        });
    }

    function updateDistributorList() {
        distributorList.innerHTML = '';
        if (!currentFloor) return;
        currentFloor.distributors.forEach((d, idx) => {
            const li = document.createElement('li');
            li.textContent = d.name || `D${idx + 1}`;
            if (d === selectedDistributor) li.classList.add('selected');
            li.addEventListener('click', () => {
                selectedDistributor = d;
                selectedWall = null;
                selectedZone = null;
                selectedPipe = null;
                selectedDoor = null;
                updateDistributorList();
                drawAll();
            });
            li.addEventListener('dblclick', () => {
                d.name = prompt('Name?', d.name || '') || d.name;
                updateDistributorList();
                scheduleHistory();
                drawAll();
            });
            distributorList.appendChild(li);
        });
    }

    function updateLayerPanel() {
        Array.from(layerPanel.querySelectorAll('.layer-item')).forEach(item => {
            const name = item.dataset.layer;
            const eye = item.querySelector('.eye');
            const lock = item.querySelector('.lock');
            const state = layers[name];
            if (eye) eye.textContent = state.visible ? '👁' : '🙈';
            if (lock) lock.textContent = state.locked ? '🔒' : '🔓';
        });
    }

    function toggleHelp() {
        helpOverlay.style.display =
            helpOverlay.style.display === 'none' || !helpOverlay.style.display
                ? 'flex'
                : 'none';
    }

    addFloorBtn.addEventListener('click', () => {
        const name = prompt('Floor name?', `Floor ${floors.length + 1}`);
        if (name) {
            addFloor(name);
            scheduleHistory();
            drawAll();
        }
    });

    renameFloorBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        const name = prompt('Floor name?', currentFloor.name);
        if (name) {
            currentFloor.name = name;
            updateFloorList();
            scheduleHistory();
        }
    });

    deleteFloorBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        if (!confirm('Delete this floor?')) return;
        const idx = floors.indexOf(currentFloor);
        if (idx >= 0) {
            floors.splice(idx, 1);
            if (floors.length) {
                currentFloor = floors[Math.min(idx, floors.length - 1)];
            } else {
                currentFloor = null;
            }
            updateFloorList();
            updateDistributorList();
            scheduleHistory();
            drawAll();
        }
    });

    drawWallBtn.addEventListener('click', () => {
        setMode('wall');
    });

    selectBtn.addEventListener('click', () => {
        setMode('select');
        selectedWall = null;
        lengthInput.value = '';
        lengthInput.disabled = true;
        drawAll();
    });

    drawZoneBtn.addEventListener('click', () => {
        setMode('zone');
    });

    addDistributorBtn.addEventListener('click', () => {
        setMode('distributor');
    });

    addDoorBtn.addEventListener('click', () => {
        setMode('door');
    });

    editDistributorBtn.addEventListener('click', () => {
        if (selectedDistributor) {
            const width = parseFloat(prompt('Width (m)?', (selectedDistributor.width/pixelsPerMeter).toFixed(2)), 10);
            const height = parseFloat(prompt('Height (m)?', (selectedDistributor.height/pixelsPerMeter).toFixed(2)), 10);
            const name = prompt('Name?', selectedDistributor.name) || selectedDistributor.name;
            const connections = parseInt(prompt('Connections?', selectedDistributor.connections), 10);
            if (!isNaN(width)) selectedDistributor.width = width * pixelsPerMeter;
            if (!isNaN(height)) selectedDistributor.height = height * pixelsPerMeter;
            if (!isNaN(connections)) selectedDistributor.connections = connections;
            const minW = (selectedDistributor.connections + 1) * PORT_SPACING;
            if (selectedDistributor.width < minW) selectedDistributor.width = minW;
            selectedDistributor.name = name;
            scheduleHistory();
            drawAll();
        }
    });

    panBtn.addEventListener('click', () => {
        setMode('pan');
    });

    centerBtn.addEventListener('click', () => {
        offsetX = 0;
        offsetY = 0;
        drawAll();
    });

    function deleteSelected() {
        if (!currentFloor) return;
        if (selectedWall) {
            const i = currentFloor.walls.indexOf(selectedWall);
            if (i >= 0) {
                // detach or remove distributors referencing this wall
                currentFloor.distributors.forEach(d => {
                    if (d.wallId != null) {
                        if (d.wallId === i) {
                            const pos = distributorPosition(d);
                            d.x = pos.x;
                            d.y = pos.y;
                            d.wallId = null;
                        } else if (d.wallId > i) {
                            d.wallId--;
                        }
                    }
                });
                currentFloor.walls.splice(i, 1);
                updateDistributorList();
            }
            selectedWall = null;
            lengthInput.value = '';
            wallThicknessInput.value = '';
            wallThicknessInput.disabled = true;
        } else if (selectedDoor && selectedWall) {
            const idx = selectedWall.doors.indexOf(selectedDoor);
            if (idx >= 0) selectedWall.doors.splice(idx,1);
            selectedDoor = null;
        } else if (selectedZone) {
            const i = currentFloor.zones.indexOf(selectedZone);
            if (i >= 0) currentFloor.zones.splice(i, 1);
            selectedZone = null;
        } else if (selectedDistributor) {
            const i = currentFloor.distributors.indexOf(selectedDistributor);
            if (i >= 0) {
                currentFloor.distributors.splice(i, 1);
                currentFloor.zones.forEach(z => {
                    if (z.distributorId === i) z.distributorId = null;
                    else if (z.distributorId > i) z.distributorId--;
                });
            }
            selectedDistributor = null;
            updateDistributorList();
        } else if (selectedPipe) {
            const i = currentFloor.pipes.indexOf(selectedPipe);
            if (i >= 0) currentFloor.pipes.splice(i, 1);
            selectedPipe = null;
        }
        scheduleHistory();
        drawAll();
    }

    deleteBtn.addEventListener('click', deleteSelected);
    deleteDistributorBtn.addEventListener('click', () => {
        if (!selectedDistributor) return;
        deleteSelected();
    });

    document.addEventListener('keydown', e => {
        const activeTag = document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { undo(); e.preventDefault(); return; }
        if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { redo(); e.preventDefault(); return; }

        // numeric length entry while drawing walls
        if (mode === 'wall' && wallStart) {
            if (/^[0-9]$/.test(e.key) || (e.key === '.' && !typedLength.includes('.'))) {
                typedLength += e.key;
                drawAll();
                e.preventDefault();
                return;
            }
            if (e.key === 'Backspace') {
                typedLength = typedLength.slice(0, -1);
                drawAll();
                e.preventDefault();
                return;
            }
            if (e.key === 'Enter' && typedLength) {
                const len = parseFloat(typedLength);
                if (!isNaN(len)) {
                    const snap = snapToPoints(mouseWorld.x, mouseWorld.y);
                    let ang = snapAngle(snap.x - wallStart.x, snap.y - wallStart.y);
                    const norm = Math.hypot(ang.dx, ang.dy) || 1;
                    const px = len * pixelsPerMeter;
                    const end = snapToPoints(
                        wallStart.x + ang.dx / norm * px,
                        wallStart.y + ang.dy / norm * px
                    );
                    currentFloor.walls.push({
                        x1: wallStart.x,
                        y1: wallStart.y,
                        x2: end.x,
                        y2: end.y,
                        thickness: defaultWallThickness,
                        doors: []
                    });
                    wallStart = end;
                    typedLength = '';
                    connectWalls();
                    scheduleHistory();
                    drawAll();
                }
                e.preventDefault();
                return;
            }
        }

        if (e.key === 'F1') {
            toggleHelp();
            e.preventDefault();
            return;
        }
        if (e.key === 'Delete') {
            deleteSelected();
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') {
            if (helpOverlay.style.display !== 'none') {
                helpOverlay.style.display = 'none';
                e.preventDefault();
                return;
            }
            if (mode === 'wall') {
                wallStart = null;
                typedLength = '';
                drawAll();
            } else if (mode === 'zone') {
                zoneDrawing = null;
                drawAll();
            } else if (mode === 'pipe') {
                pipeDrawing = null;
                drawAll();
            }
            e.preventDefault();
            return;
        }

        const key = e.key.toLowerCase();
        switch (key) {
            case 'w': setMode('wall'); break;
            case 'd': setMode('door'); break;
            case 'x': setMode('distributor'); break;
            case 'z': setMode('zone'); break;
            case 's': setMode('select'); break;
            case 'c': offsetX = 0; offsetY = 0; drawAll(); break;
            case 'p': setMode('pan'); break;
            case 'm': setMode('pipe'); break;
            case 'r': generatePipes(); break;
            default: return; // ignore others
        }
        e.preventDefault();
    });

    clearBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        if (!confirm('Clear all items on this floor?')) return;
        currentFloor.walls = [];
        currentFloor.zones = [];
        currentFloor.distributors = [];
        currentFloor.pipes = [];
        selectedWall = null;
        selectedZone = null;
        selectedDistributor = null;
        selectedPipe = null;
        updateDistributorList();
        scheduleHistory();
        drawAll();
    });


    lengthInput.addEventListener('change', () => {
        if (!selectedWall) return;
        const len = parseFloat(lengthInput.value);
        if (isNaN(len)) return;
        const target = len * pixelsPerMeter;
        const dx = selectedWall.x2 - selectedWall.x1;
        const dy = selectedWall.y2 - selectedWall.y1;
        const current = Math.hypot(dx, dy) || 1;
        const factor = target / current;
        selectedWall.x2 = selectedWall.x1 + dx * factor;
        selectedWall.y2 = selectedWall.y1 + dy * factor;
        connectWalls();
        scheduleHistory();
        drawAll();
    });

    wallThicknessInput.addEventListener('change', () => {
        if (!selectedWall) return;
        const th = parseFloat(wallThicknessInput.value);
        if (isNaN(th)) return;
        selectedWall.thickness = th * pixelsPerMeter;
        scheduleHistory();
        drawAll();
    });

    function drawGrid() {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();

        const left = -offsetX / scale;
        const right = (canvas.width - offsetX) / scale;
        const top = -offsetY / scale;
        const bottom = (canvas.height - offsetY) / scale;

        const startX = Math.floor(left / gridSize) * gridSize;
        for (let x = startX; x <= right; x += gridSize) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }

        const startY = Math.floor(top / gridSize) * gridSize;
        for (let y = startY; y <= bottom; y += gridSize) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    function drawPlanImage() {
        if (!currentFloor || !currentFloor.background || !currentFloor.background.image) return;
        const bg = currentFloor.background;
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = bg.opacity;
        ctx.translate(bg.offsetX, bg.offsetY);
        ctx.rotate(bg.rotation);
        ctx.scale(bg.scale, bg.scale);
        ctx.drawImage(bg.image, 0, 0);
        ctx.restore();
    }

    function drawAll() {
        if (historyPending) {
            pushHistoryNow();
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        lengthBox.style.display = 'none';
        drawPlanImage();
        if (layers.guides.visible) drawGrid();
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        if (!currentFloor) { ctx.restore(); return; }
        ctx.strokeStyle = '#000';
        // walls
        if (layers.walls.visible) {
            currentFloor.walls.forEach(w => {
                drawWall(w, w === selectedWall);
            });
            drawWallJoints();
        }
        ctx.strokeStyle = '#000';
        // zones
        if (layers.zones.visible) currentFloor.zones.forEach(z => {
            ctx.beginPath();
            ctx.moveTo(z.points[0].x, z.points[0].y);
            for (let i = 1; i < z.points.length; i++) {
                ctx.lineTo(z.points[i].x, z.points[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = z === selectedZone ? 'rgba(0,255,0,0.3)' : 'rgba(0,255,0,0.1)';
            ctx.fill();
            ctx.strokeStyle = z === selectedZone ? 'red' : '#000';
            ctx.stroke();
            if (z.name) {
                const b = zoneBounds(z);
                ctx.fillStyle = '#000';
                ctx.fillText(z.name, b.x + 4, b.y + 12);
            }
        });
        if (layers.zones.visible && zoneDrawing && mode === 'zone') {
            ctx.beginPath();
            ctx.moveTo(zoneDrawing[0].x, zoneDrawing[0].y);
            for (let i = 1; i < zoneDrawing.length; i++) {
                ctx.lineTo(zoneDrawing[i].x, zoneDrawing[i].y);
            }
            const snap = snapToPoints(mouseWorld.x, mouseWorld.y);
            ctx.lineTo(snap.x, snap.y);
            ctx.strokeStyle = 'red';
            ctx.stroke();
        }
        if (layers.pipes.visible && pipeDrawing && mode === 'pipe') {
            const snap = snapToPipePoints(mouseWorld.x, mouseWorld.y);
            const pts = pipeDrawing.points.concat([{x:snap.x, y:snap.y}]);
            drawPipePath(pts, 'red', 0);
            drawPipePath(pts.slice().reverse(), 'blue', PARALLEL_OFFSET);
        }

        let previewSnap = null;
        if (mode === 'wall') {
            previewSnap = snapToPoints(mouseWorld.x, mouseWorld.y);
        } else if (mode === 'pipe') {
            previewSnap = snapToPipePoints(mouseWorld.x, mouseWorld.y);
        }

        let lengthInfo = null;
        if (wallStart && mode === 'wall') {
            const ang = snapAngle(previewSnap.x - wallStart.x, previewSnap.y - wallStart.y);
            let endX = wallStart.x + ang.dx;
            let endY = wallStart.y + ang.dy;
            if (typedLength) {
                const norm = Math.hypot(ang.dx, ang.dy) || 1;
                const px = parseFloat(typedLength) * pixelsPerMeter;
                endX = wallStart.x + ang.dx / norm * px;
                endY = wallStart.y + ang.dy / norm * px;
            }
            const end = snapToPoints(endX, endY);
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(wallStart.x, wallStart.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            lengthInfo = { start: wallStart, end };
        }

        if (mode === 'wall' && previewSnap && previewSnap.snapped) {
            ctx.strokeStyle = 'orange';
            ctx.beginPath();
            ctx.arc(previewSnap.x, previewSnap.y, 5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (mode === 'pipe' && previewSnap && previewSnap.snapped) {
            ctx.strokeStyle = 'orange';
            ctx.beginPath();
            ctx.arc(previewSnap.x, previewSnap.y, 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (zoneDrawing && mode === 'zone') {
            const start = zoneDrawing[zoneDrawing.length - 1];
            const snap = snapToPoints(mouseWorld.x, mouseWorld.y);
            lengthInfo = { start, end: snap };
        } else if (pipeDrawing && mode === 'pipe') {
            const start = pipeDrawing.points[pipeDrawing.points.length-1];
            const snap = snapToPipePoints(mouseWorld.x, mouseWorld.y);
            lengthInfo = { start, end: snap };
        }
        // distributors
        if (layers.distributors.visible) {
        ctx.fillStyle = 'rgba(0,0,255,0.3)';
        currentFloor.distributors.forEach(d => {
            const corners = distributorCorners(d);
            const pos = distributorPosition(d);
            ctx.fillStyle = d === selectedDistributor ? 'rgba(0,0,255,0.5)' : 'rgba(0,0,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = d === selectedDistributor ? 'red' : '#000';
            ctx.stroke();
            if (d.name) {
                ctx.fillStyle = '#000';
                ctx.fillText(d.name, pos.x + 2, pos.y + 12);
            }
        });
        }

        // manual pipe paths not yet generated
        if (layers.pipes.visible) currentFloor.zones.forEach(z => {
            if (z.manualPath && !currentFloor.pipes.some(p => p.zone === z)) {
                drawPipePath(z.manualPath, 'red', 0);
                drawPipePath(z.manualPath.slice().reverse(), 'blue', PARALLEL_OFFSET);
            }
        });

        // pipes
        if (layers.pipes.visible) currentFloor.pipes.forEach(p => {
            const base = PARALLEL_OFFSET * 2 * (p.parallelIndex || 0);
            drawPipePath(p.supplyPath, p === selectedPipe ? 'orange' : 'red', base, p.crossings || []);
            const retCross = (p.crossings || []).map(i => p.returnPath.length - 2 - i);
            drawPipePath(p.returnPath, p === selectedPipe ? 'orange' : 'blue', base + PARALLEL_OFFSET, retCross);
        });
        ctx.restore();

        if (lengthInfo) {
            const len = Math.hypot(lengthInfo.end.x - lengthInfo.start.x,
                                   lengthInfo.end.y - lengthInfo.start.y) / pixelsPerMeter;
            const rect = canvas.getBoundingClientRect();
            const sx = rect.left + window.scrollX + lengthInfo.end.x * scale + offsetX;
            const sy = rect.top + window.scrollY + lengthInfo.end.y * scale + offsetY;
            const txt = typedLength ? typedLength + ' m' : len.toFixed(2) + ' m';
            lengthBox.textContent = txt;
            lengthBox.style.left = sx + 'px';
            lengthBox.style.top = (sy - 10) + 'px';
            lengthBox.style.display = 'block';
        }
    }

    function closestPointOnRect(rect, x, y) {
        const cx = Math.max(rect.x, Math.min(x, rect.x + rect.width));
        const cy = Math.max(rect.y, Math.min(y, rect.y + rect.height));
        return { x: cx, y: cy };
    }

    function closestPointOnZone(zone, x, y) {
        let best = null;
        let bestDist = Infinity;
        const pts = zone.points;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const t = projectionOnSegment(x, y, a.x, a.y, b.x, b.y);
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            const d = Math.hypot(px - x, py - y);
            if (d < bestDist) {
                bestDist = d;
                best = { x: px, y: py };
            }
        }
        return best;
    }

    function entryPointForZone(zone, from) {
        let best = null;
        let bestDist = Infinity;
        currentFloor.walls.forEach(w => {
            (w.doors || []).forEach(d => {
                const doorPos = doorCenter(w, d);
                const zonePt = closestPointOnZone(zone, doorPos.x, doorPos.y);
                const dist = Math.hypot(doorPos.x - from.x, doorPos.y - from.y) +
                             Math.hypot(zonePt.x - doorPos.x, zonePt.y - doorPos.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = zonePt;
                }
            });
        });
        if (!best) best = closestPointOnZone(zone, from.x, from.y);
        return best;
    }

    function segmentPolygonIntersections(ax, ay, bx, by, poly) {
        const pts = [];
        for (let i = 0; i < poly.length; i++) {
            const c = poly[i];
            const d = poly[(i + 1) % poly.length];
            const inter = lineIntersection(ax, ay, bx, by, c.x, c.y, d.x, d.y);
            if (inter) {
                pts.push({ x: inter.x, y: inter.y, t: inter.t1 });
            }
        }
        pts.sort((a, b) => a.t - b.t);
        return pts;
    }

    function clipPathToPolygon(path, poly) {
        if (path.length < 2) return path;
        const out = [];
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const insideA = pointInPolygon(a.x, a.y, poly);
            const insideB = pointInPolygon(b.x, b.y, poly);
            const inters = segmentPolygonIntersections(a.x, a.y, b.x, b.y, poly);
            if (insideA) out.push(a);
            inters.forEach(p => out.push({ x: p.x, y: p.y }));
            if (insideB) out.push(b);
        }
        if (!out.length) return path;
        const dedup = [out[0]];
        for (let i = 1; i < out.length; i++) {
            const prev = dedup[dedup.length - 1];
            const p = out[i];
            if (Math.hypot(prev.x - p.x, prev.y - p.y) > 1e-6) dedup.push(p);
        }
        return dedup;
    }

    function generatePipes() {
        if (!currentFloor) return;
        const graph = buildGraphForILP();
        const pairs = [];
        currentFloor.distributors.forEach((d, di) => {
            const zones = currentFloor.zones.filter(z => z.distributorId === di);
            zones.forEach(z => {
                const entry = entryPointForZone(z, distributorPort(d));
                pairs.push({ zone: z, dist: d, spacing: z.spacing || (parseInt(spacingInput.value,10)||0)/1000*pixelsPerMeter || gridSize, start: {x: distributorPort(d).x, y: distributorPort(d).y}, end: entry });
            });
        });
        if (!pairs.length) return;
        const circuits = pairs.map(p => ({ start: nearestNode(graph, p.start), end: nearestNode(graph, p.end) }));
        if (ilpWorker) {
            ilpWorker.onmessage = ev => {
                if (ev.data.status !== 'ok') { generatePipesAStar(); return; }
                const paths = ev.data.paths.map((edges,i)=>edgesToPath(graph, edges, circuits[i].start));
                buildPipesFromPaths(pairs, paths);
            };
            ilpWorker.postMessage({ graph, circuits, maxLen: MAX_CIRCUIT_LENGTH * pixelsPerMeter, timeout: 2 });
        } else {
            generatePipesAStar();
        }
    }

    function buildPipesFromPaths(pairs, paths) {
        currentFloor.pipes = [];
        const segmentCounts = new Map();
        pairs.forEach((pair, idx) => {
            const zone = pair.zone;
            let toEntry = paths[idx];
            if (!toEntry) {
                toEntry = findPath({x:pair.start.x,y:pair.start.y},{x:pair.end.x,y:pair.end.y},{avoidZones:true,excludeZone:zone,spacing:pair.spacing}) || [];
            }
            const entry = toEntry[toEntry.length-1];
            const baseOffset = 0;
            const entryOffsetPath = offsetPath(toEntry, baseOffset);
            const zonePath = zoneLoopPath(zone, pair.spacing, entry);
            const supplyPath = entryOffsetPath.concat(zonePath);
            const returnPath = offsetPath(toEntry.slice().reverse(), baseOffset + PARALLEL_OFFSET);
            const length = pathLength(supplyPath) + pathLength(returnPath);
            currentFloor.pipes.push({ zone, distributor: pair.dist, supplyPath, returnPath, length, parallelIndex:0, crossings: [] });
            for (let i=0;i<toEntry.length-1;i++) {
                const key = segmentKey(toEntry[i], toEntry[i+1]);
                segmentCounts.set(key,(segmentCounts.get(key)||0)+1);
            }
        });
        scheduleHistory();
        drawAll();
    }

function generatePipesAStar() {
        if (!currentFloor) return;
        currentFloor.pipes = [];
        const segmentCounts = new Map();

        currentFloor.distributors.forEach((dist, idx) => {
            const zoneList = currentFloor.zones.filter(z => z.distributorId === idx);
            zoneList.sort((a,b)=>{
                const pos = distributorPort(dist);
                const ea = entryPointForZone(a, pos);
                const eb = entryPointForZone(b, pos);
                return Math.hypot(eb.x-pos.x, eb.y-pos.y) - Math.hypot(ea.x-pos.x, ea.y-pos.y);
            });

            zoneList.forEach(zone => {
                const defSpacing = (parseInt(spacingInput.value, 10) || 0) / 1000 * pixelsPerMeter;
                const spacing = zone.spacing || defSpacing || gridSize;
                const distPos = distributorPort(dist);
                let toEntry, entry;
                if (zone.manualPath) {
                    toEntry = zone.manualPath.slice();
                    entry = toEntry[toEntry.length - 1];
                } else {
                    entry = entryPointForZone(zone, distPos);
                    toEntry = findPath({ x: distPos.x, y: distPos.y }, entry, {avoidZones: true, excludeZone: zone, spacing});
                    if (!toEntry) {
                        toEntry = findPath({ x: distPos.x, y: distPos.y }, entry, {avoidZones: false, spacing});
                    }
                    if (!toEntry) {
                        alert(`No path found from distributor "${dist.name}" to zone "${zone.name}"`);
                        return;
                    }
                    toEntry = expandDiagonals(toEntry, {avoidZones: true, excludeZone: zone});

                    if (!pathValid(toEntry, {avoidZones:false})) {
                        alert(`No path found from distributor "${dist.name}" to zone "${zone.name}"`);
                        return;
                    }
                }

                const crossings = zoneCrossingIndices(toEntry, zone);

                let parallelIndex = 0;
                for (let i = 0; i < toEntry.length - 1; i++) {
                    const key = segmentKey(toEntry[i], toEntry[i+1]);
                    const count = segmentCounts.get(key) || 0;
                    if (count > parallelIndex) parallelIndex = count;
                }

                const baseOffset = PARALLEL_OFFSET * 2 * parallelIndex;
                const entryOffsetPath = offsetPath(toEntry, baseOffset);
                entry = entryOffsetPath[entryOffsetPath.length - 1];
                const zonePath = zoneLoopPath(zone, spacing, entry);
                const supplyPath = entryOffsetPath.concat(zonePath);
                const returnPath = offsetPath(toEntry.slice().reverse(), baseOffset + PARALLEL_OFFSET);

                if (!pathValid(supplyPath, {avoidZones:false}) || !pathValid(returnPath, {avoidZones:false})) {
                    alert(`Pipe layout for zone "${zone.name}" intersects a wall`);
                    return;
                }

                const length = pathLength(supplyPath) + pathLength(returnPath);
                if (length > MAX_CIRCUIT_LENGTH) {
                    alert(`Pipe circuit for zone "${zone.name}" exceeds ${MAX_CIRCUIT_LENGTH} m`);
                }

                currentFloor.pipes.push({ zone, distributor: dist, supplyPath, returnPath, length, parallelIndex, crossings });

                for (let i = 0; i < toEntry.length - 1; i++) {
                    const key = segmentKey(toEntry[i], toEntry[i+1]);
                    segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
                }
            });
        });
        scheduleHistory();
        drawAll();
    }

    function toMeters(v) { return v / pixelsPerMeter; }
    function fromMeters(v) { return v * pixelsPerMeter; }

    function serializeProject() {
        return {
            floors: floors.map(f => ({
                name: f.name,
                walls: f.walls.map(w => ({
                    x1: toMeters(w.x1),
                    y1: toMeters(w.y1),
                    x2: toMeters(w.x2),
                    y2: toMeters(w.y2),
                    thickness: toMeters(w.thickness || defaultWallThickness),
                    doors: (w.doors||[]).map(d => ({ offset: toMeters(d.offset), width: toMeters(d.width) }))
                })),
                zones: f.zones.map(z => ({
                    name: z.name,
                    spacing: toMeters(z.spacing),
                    distributorId: z.distributorId,
                    points: z.points.map(p => ({x: toMeters(p.x), y: toMeters(p.y)})),
                    manualPath: z.manualPath ? z.manualPath.map(p=>({x:toMeters(p.x),y:toMeters(p.y)})) : null
                })),
                distributors: f.distributors.map(d => ({
                    name: d.name,
                    width: toMeters(d.width),
                    height: toMeters(d.height),
                    connections: d.connections,
                    wallId: d.wallId,
                    offset: d.offset != null ? toMeters(d.offset) : null,
                    sign: d.sign,
                    x: d.x != null ? toMeters(d.x) : null,
                    y: d.y != null ? toMeters(d.y) : null,
                    nextPort: d.nextPort || 0
                })),
                pipes: f.pipes.map(p => ({
                    zoneIndex: f.zones.indexOf(p.zone),
                    distributorIndex: f.distributors.indexOf(p.distributor),
                    parallelIndex: p.parallelIndex || 0,
                    supplyPath: p.supplyPath.map(pt=>({x:toMeters(pt.x),y:toMeters(pt.y)})),
                    returnPath: p.returnPath.map(pt=>({x:toMeters(pt.x),y:toMeters(pt.y)}))
                }))
            }))
        };
    }

    function deserializeProject(data) {
        floors = (data.floors||[]).map(f => {
            const floor = {name: f.name, walls: [], zones: [], distributors: [], pipes: []};
            floor.walls = (f.walls||[]).map(w => ({
                x1: fromMeters(w.x1),
                y1: fromMeters(w.y1),
                x2: fromMeters(w.x2),
                y2: fromMeters(w.y2),
                thickness: fromMeters(w.thickness),
                doors: (w.doors||[]).map(d=>({offset:fromMeters(d.offset), width:fromMeters(d.width)}))
            }));
            floor.zones = (f.zones||[]).map(z => ({
                name: z.name,
                spacing: fromMeters(z.spacing),
                distributorId: z.distributorId,
                points: (z.points||[]).map(p=>({x:fromMeters(p.x), y:fromMeters(p.y)})),
                manualPath: z.manualPath ? z.manualPath.map(p=>({x:fromMeters(p.x), y:fromMeters(p.y)})) : null
            }));
            floor.distributors = (f.distributors||[]).map(d => ({
                name: d.name,
                width: fromMeters(d.width),
                height: fromMeters(d.height),
                connections: d.connections,
                wallId: d.wallId,
                offset: d.offset != null ? fromMeters(d.offset) : null,
                sign: d.sign,
                x: d.x != null ? fromMeters(d.x) : null,
                y: d.y != null ? fromMeters(d.y) : null,
                nextPort: d.nextPort || 0
            }));
            floor.pipes = (f.pipes||[]).map(p => ({
                zoneIndex: p.zoneIndex,
                distributorIndex: p.distributorIndex,
                parallelIndex: p.parallelIndex || 0,
                supplyPath: p.supplyPath.map(pt=>({x:fromMeters(pt.x),y:fromMeters(pt.y)})),
                returnPath: p.returnPath.map(pt=>({x:fromMeters(pt.x),y:fromMeters(pt.y)}))
            }));
            return floor;
        });
        floors.forEach(fl => {
            fl.pipes.forEach(p => {
                p.zone = fl.zones[p.zoneIndex];
                p.distributor = fl.distributors[p.distributorIndex];
                p.length = pathLength(p.supplyPath) + pathLength(p.returnPath);
            });
        });
        currentFloor = floors[0] || null;
        updateFloorList();
        updateDistributorList();
        connectWalls();
        scheduleHistory();
        drawAll();
    }

    function handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                deserializeProject(data);
            } catch (err) {
                alert('Invalid project file');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function handlePlanImage(e) {
        const file = e.target.files[0];
        if (!file || !currentFloor) return;
        const img = new Image();
        img.onload = () => {
            currentFloor.background = { image: img, offsetX: 0, offsetY: 0, scale: 1, rotation: 0, opacity: parseFloat(planOpacity.value) || 0.5 };
            planDialog.style.display = 'block';
            drawAll();
        };
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }

    function exportPlan() {
        if (!currentFloor) return;
        drawAll();
        const png = canvas.toDataURL('image/png');
        const project = serializeProject();
        const pipeData = currentFloor.pipes.map(p => ({
            zone: p.zone.name || '',
            distributor: p.distributor.name || '',
            length_m: p.length.toFixed(2)
        }));
        project.pipe_lengths = pipeData;
        const json = JSON.stringify(project, null, 2);
        const imgLink = document.createElement('a');
        imgLink.href = png;
        imgLink.download = 'floorplan.png';
        imgLink.click();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const dataLink = document.createElement('a');
        dataLink.href = url;
        dataLink.download = 'floorplan-data.json';
        dataLink.click();
    }

    function snapAngle(dx, dy) {
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        let result = angle;
        if (Math.abs(angle - snap) < Math.PI / 18) { // ~10 degrees
            result = snap;
        }
        const len = Math.sqrt(dx * dx + dy * dy);
        return {
            dx: Math.cos(result) * len,
            dy: Math.sin(result) * len
        };
    }

    function applyReference(p1, p2, distMeters) {
        if (!currentFloor || !currentFloor.background) return;
        const bg = currentFloor.background;
        const imgP1 = worldToPlan(p1);
        const imgP2 = worldToPlan(p2);
        const imgDist = Math.hypot(imgP2.x - imgP1.x, imgP2.y - imgP1.y);
        if (!imgDist) return;
        bg.scale = distMeters * pixelsPerMeter / imgDist;
        const imgAngle = Math.atan2(imgP2.y - imgP1.y, imgP2.x - imgP1.x);
        bg.rotation = -imgAngle;
        const cos = Math.cos(bg.rotation);
        const sin = Math.sin(bg.rotation);
        bg.offsetX = p1.x - (imgP1.x * bg.scale * cos - imgP1.y * bg.scale * sin);
        bg.offsetY = p1.y - (imgP1.x * bg.scale * sin + imgP1.y * bg.scale * cos);
    }

    function snapToPoints(x, y) {
        let sx = x, sy = y;
        let best = Infinity;

        function consider(px, py) {
            const d = Math.hypot(px - x, py - y);
            if (d < SNAP_DIST && d < best) {
                sx = px;
                sy = py;
                best = d;
            }
        }

        // grid snapping
        const gx = Math.round(x / gridSize) * gridSize;
        const gy = Math.round(y / gridSize) * gridSize;
        consider(gx, gy);

        // snap to wall points
        currentFloor.walls.forEach(w => {
            const pts = [
                { x: w.x1, y: w.y1 },
                { x: w.x2, y: w.y2 },
                { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }
            ];
            pts.forEach(p => consider(p.x, p.y));

            // snap to nearest point on wall segment
            const t = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
            const px = w.x1 + (w.x2 - w.x1) * t;
            const py = w.y1 + (w.y2 - w.y1) * t;
            consider(px, py);
        });

        // snap to intersection points
        for (let i = 0; i < currentFloor.walls.length; i++) {
            for (let j = i + 1; j < currentFloor.walls.length; j++) {
                const a = currentFloor.walls[i];
                const b = currentFloor.walls[j];
                const inter = lineIntersection(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2);
                if (inter) consider(inter.x, inter.y);
            }
        }

        // snap to zone vertices
        currentFloor.zones.forEach(z => {
            z.points.forEach(p => consider(p.x, p.y));
        });

        return { x: sx, y: sy, snapped: best < Infinity };
    }

    // snapping for manual pipe drawing
    function snapToPipePoints(x, y) {
        let sx = x, sy = y;
        let best = Infinity;

        function consider(px, py) {
            const d = Math.hypot(px - x, py - y);
            if (d < SNAP_DIST && d < best) {
                sx = px; sy = py; best = d;
            }
        }

        const gx = Math.round(x / pipeGrid) * pipeGrid;
        const gy = Math.round(y / pipeGrid) * pipeGrid;
        consider(gx, gy);

        currentFloor.distributors.forEach(d => {
            for (let i = 0; i < (d.connections || 1); i++) {
                const p = distributorPort(d, i);
                consider(p.x, p.y);
            }
        });

        currentFloor.zones.forEach(z => {
            const p = closestPointOnZone(z, x, y);
            consider(p.x, p.y);
        });

        return {x: sx, y: sy, snapped: best < Infinity};
    }

    function wallLength(w) {
        return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    }

    function wallLengthMeters(w) {
        return wallLength(w) / pixelsPerMeter;
    }

    function hitTestWall(x, y) {
        if (!layers.walls.visible) return {wall: null};
        for (let i = currentFloor.walls.length - 1; i >= 0; i--) {
            const w = currentFloor.walls[i];
            if (Math.hypot(w.x1 - x, w.y1 - y) < SNAP_DIST) {
                return {wall: w, mode: 'end1'};
            }
            if (Math.hypot(w.x2 - x, w.y2 - y) < SNAP_DIST) {
                return {wall: w, mode: 'end2'};
            }
            const dist = distanceToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
            if (dist < SNAP_DIST) {
                const t = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
                const along = t * wallLength(w);
                const doorHit = (w.doors || []).some(d =>
                    along >= d.offset - d.width/2 && along <= d.offset + d.width/2
                );
                if (!doorHit) return {wall: w, mode: 'move'};
            }
        }
        return {wall: null};
    }

    function distanceToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const lx = x1 + t * dx;
        const ly = y1 + t * dy;
        return Math.hypot(px - lx, py - ly);
    }

    function projectionOnSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return 0;
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return t;
    }

    function zoneBounds(z) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        z.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    function pointInPolygon(x, y, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
        function ccw(x1, y1, x2, y2, x3, y3) {
            return (y3 - y1) * (x2 - x1) > (y2 - y1) * (x3 - x1);
        }
        return (ccw(ax1, ay1, bx1, by1, bx2, by2) !== ccw(ax2, ay2, bx1, by1, bx2, by2)) &&
               (ccw(ax1, ay1, ax2, ay2, bx1, by1) !== ccw(ax1, ay1, ax2, ay2, bx2, by2));
    }

    function lineIntersection(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
        const dax = ax2 - ax1;
        const day = ay2 - ay1;
        const dbx = bx2 - bx1;
        const dby = by2 - by1;
        const denom = dax * dby - day * dbx;
        if (denom === 0) return null;
        const t1 = ((bx1 - ax1) * dby - (by1 - ay1) * dbx) / denom;
        const t2 = ((bx1 - ax1) * day - (by1 - ay1) * dax) / denom;
        if (t1 < 0 || t1 > 1 || t2 < 0 || t2 > 1) return null;
        return {
            x: ax1 + t1 * dax,
            y: ay1 + t1 * day,
            t1,
            t2
        };
    }

    function doorOpenAt(w, along) {
        return (w.doors || []).some(d =>
            along >= d.offset - d.width/2 && along <= d.offset + d.width/2
        );
    }

    function doorCenter(w, door) {
        const len = wallLength(w);
        const ux = (w.x2 - w.x1) / len;
        const uy = (w.y2 - w.y1) / len;
        return {
            x: w.x1 + ux * door.offset,
            y: w.y1 + uy * door.offset
        };
    }

    function offsetPath(path, dist) {
        if (Math.abs(dist) < 1e-6) return path.map(p => ({ x: p.x, y: p.y }));
        const segs = [];
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            const ox = -dy / len * dist;
            const oy = dx / len * dist;
            segs.push({
                start: { x: p1.x + ox, y: p1.y + oy },
                end: { x: p2.x + ox, y: p2.y + oy }
            });
        }
        const out = [segs[0].start];
        for (let i = 0; i < segs.length - 1; i++) {
            const s1 = segs[i];
            const s2 = segs[i + 1];
            const inter = lineIntersection(
                s1.start.x, s1.start.y, s1.end.x, s1.end.y,
                s2.start.x, s2.start.y, s2.end.x, s2.end.y
            );
            out.push(inter ? { x: inter.x, y: inter.y } : s1.end);
        }
        out.push(segs[segs.length - 1].end);
        return out;
    }

    function polygonArea(poly) {
        let a = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            a += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
        }
        return a / 2;
    }

    function offsetPolygon(poly, dist) {
        if (poly.length < 3) return poly.slice();
        const sign = polygonArea(poly) > 0 ? 1 : -1;
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const p0 = poly[(i - 1 + poly.length) % poly.length];
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];
            const dx1 = p1.x - p0.x;
            const dy1 = p1.y - p0.y;
            const dx2 = p2.x - p1.x;
            const dy2 = p2.y - p1.y;
            const len1 = Math.hypot(dx1, dy1) || 1;
            const len2 = Math.hypot(dx2, dy2) || 1;
            const n1x = sign * dy1 / len1;
            const n1y = -sign * dx1 / len1;
            const n2x = sign * dy2 / len2;
            const n2y = -sign * dx2 / len2;
            const p1a = { x: p0.x + n1x * dist, y: p0.y + n1y * dist };
            const p1b = { x: p1.x + n1x * dist, y: p1.y + n1y * dist };
            const p2a = { x: p1.x + n2x * dist, y: p1.y + n2y * dist };
            const p2b = { x: p2.x + n2x * dist, y: p2.y + n2y * dist };
            const inter = lineIntersection(p1a.x, p1a.y, p1b.x, p1b.y,
                                          p2a.x, p2a.y, p2b.x, p2b.y);
            out.push(inter ? { x: inter.x, y: inter.y } : p1b);
        }
        return out;
    }

    function polygonCentroid(poly) {
        let cx = 0, cy = 0, a = 0;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
            cx += (poly[j].x + poly[i].x) * f;
            cy += (poly[j].y + poly[i].y) * f;
            a += f;
        }
        a = a || 1;
        cx /= 3 * a;
        cy /= 3 * a;
        return { x: cx, y: cy };
    }

    function rotatePoint(p, angle, origin) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = p.x - origin.x;
        const y = p.y - origin.y;
        return {
            x: origin.x + x * cos - y * sin,
            y: origin.y + x * sin + y * cos
        };
    }

    function dominantAxisAngle(points) {
        const c = polygonCentroid(points);
        let sxx = 0, syy = 0, sxy = 0;
        points.forEach(p => {
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
        });
        return 0.5 * Math.atan2(2 * sxy, sxx - syy);
    }

    function perpendicularDistance(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy || 1;
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        const projx = a.x + t * dx;
        const projy = a.y + t * dy;
        return Math.hypot(p.x - projx, p.y - projy);
    }

    function manhattanSimplify(path, options = {}) {
        let out = path.slice();
        let changed = true;
        while (changed && out.length > 2) {
            changed = false;
            for (let i = 0; i < out.length - 2; i++) {
                if (lineClear(out[i], out[i + 2], options)) {
                    out.splice(i + 1, 1);
                    changed = true;
                    break;
                }
            }
        }
        return out;
    }

    function rdpSimplify(points, epsilon) {
        if (points.length <= 2) return points.slice();
        let dmax = 0, index = 0;
        const end = points.length - 1;
        for (let i = 1; i < end; i++) {
            const d = perpendicularDistance(points[i], points[0], points[end]);
            if (d > dmax) { index = i; dmax = d; }
        }
        if (dmax > epsilon) {
            const res1 = rdpSimplify(points.slice(0, index + 1), epsilon);
            const res2 = rdpSimplify(points.slice(index), epsilon);
            return res1.slice(0, -1).concat(res2);
        }
        return [ points[0], points[end] ];
    }


    function wallHitInfo(x, y) {
        for (let i = currentFloor.walls.length - 1; i >= 0; i--) {
            const w = currentFloor.walls[i];
            const len = wallLength(w);
            const dist = distanceToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
            if (dist <= (w.thickness || defaultWallThickness) / 2 + SNAP_DIST) {
                const t = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
                const along = t * len;
                const ux = (w.x2 - w.x1) / len;
                const uy = (w.y2 - w.y1) / len;
                const nx = -uy;
                const ny = ux;
                const px = w.x1 + ux * along;
                const py = w.y1 + uy * along;
                const sign = ((x - px) * nx + (y - py) * ny) >= 0 ? 1 : -1;
                return { wall: w, index: i, along, sign };
            }
        }
        return null;
    }

    function distributorPosition(d) {
        if (d.wallId != null) {
            const w = currentFloor.walls[d.wallId];
            if (!w) return { x: d.x, y: d.y };
            const len = wallLength(w);
            const ux = (w.x2 - w.x1) / len;
            const uy = (w.y2 - w.y1) / len;
            const nx = -uy;
            const ny = ux;
            const thick = w.thickness || defaultWallThickness;
            const extra = 0.02 * pixelsPerMeter;
            const centerOff = d.sign * (thick / 2 - d.height / 2 + extra);
            return {
                x: w.x1 + ux * d.offset + nx * centerOff,
                y: w.y1 + uy * d.offset + ny * centerOff
            };
        }
        return { x: d.x, y: d.y };
    }

    function distributorPort(d, index = 0) {
        if (d.wallId != null) {
            const w = currentFloor.walls[d.wallId];
            if (!w) return { x: d.x, y: d.y };
            const len = wallLength(w);
            const ux = (w.x2 - w.x1) / len;
            const uy = (w.y2 - w.y1) / len;
            const nx = -uy;
            const ny = ux;
            const thick = w.thickness || defaultWallThickness;
            const along = d.offset - d.width / 2 + PORT_SPACING + index * PORT_SPACING;
            let px = w.x1 + ux * along + nx * d.sign * (thick / 2);
            let py = w.y1 + uy * along + ny * d.sign * (thick / 2);
            px = Math.round(px / pipeGrid) * pipeGrid;
            py = Math.round(py / pipeGrid) * pipeGrid;
            return { x: px, y: py };
        }
        let px = d.x - d.width / 2 + PORT_SPACING + index * PORT_SPACING;
        let py = d.y;
        px = Math.round(px / pipeGrid) * pipeGrid;
        py = Math.round(py / pipeGrid) * pipeGrid;
        return { x: px, y: py };
    }

    function distributorCorners(d) {
        const pos = distributorPosition(d);
        if (d.wallId != null) {
            const w = currentFloor.walls[d.wallId];
            if (!w) return [pos];
            const len = wallLength(w);
            const ux = (w.x2 - w.x1) / len;
            const uy = (w.y2 - w.y1) / len;
            const nx = -uy;
            const ny = ux;
            const hw = d.width / 2;
            const hh = d.height / 2;
            return [
                { x: pos.x - ux * hw - nx * hh, y: pos.y - uy * hw - ny * hh },
                { x: pos.x + ux * hw - nx * hh, y: pos.y + uy * hw - ny * hh },
                { x: pos.x + ux * hw + nx * hh, y: pos.y + uy * hw + ny * hh },
                { x: pos.x - ux * hw + nx * hh, y: pos.y - uy * hw + ny * hh }
            ];
        }
        return [
            { x: pos.x - d.width / 2, y: pos.y - d.height / 2 },
            { x: pos.x + d.width / 2, y: pos.y - d.height / 2 },
            { x: pos.x + d.width / 2, y: pos.y + d.height / 2 },
            { x: pos.x - d.width / 2, y: pos.y + d.height / 2 }
        ];
    }

    function segmentIntersectsWall(x1, y1, x2, y2) {
        for (const w of currentFloor.walls) {
            const thick = (w.thickness || defaultWallThickness);
            const len = wallLength(w);

            if (segmentsIntersect(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2)) {
                const inter = lineIntersection(x1, y1, x2, y2, w.x1, w.y1, w.x2, w.y2);
                const along = inter ? inter.t2 * len : projectionOnSegment(x1, y1, w.x1, w.y1, w.x2, w.y2) * len;
                if (!doorOpenAt(w, along)) return true;
            }

            const pts = [
                {x:x1,y:y1},
                {x:x2,y:y2},
                {x:(x1+x2)/2, y:(y1+y2)/2}
            ];
            for (const p of pts) {
                const dist = distanceToSegment(p.x, p.y, w.x1, w.y1, w.x2, w.y2);
                const along = projectionOnSegment(p.x, p.y, w.x1, w.y1, w.x2, w.y2) * len;
                if (dist < thick/2 && along >= 0 && along <= len && !doorOpenAt(w, along)) {
                    return true;
                }
            }
        }
        return false;
    }

    function segmentIntersectsAnyZone(x1, y1, x2, y2, exclude) {
        for (const z of currentFloor.zones) {
            if (z === exclude) continue;
            if (pointInPolygon(x1, y1, z.points) || pointInPolygon(x2, y2, z.points))
                return true;
            if (segmentPolygonIntersections(x1, y1, x2, y2, z.points).length)
                return true;
        }
        return false;
    }

    function floorBounds() {
        if (!currentFloor || currentFloor.walls.length === 0) {
            const range = 500 * pixelsPerMeter; // allow ~1 km square area
            return { minX: -range, maxX: range, minY: -range, maxY: range };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentFloor.walls.forEach(w => {
            minX = Math.min(minX, w.x1, w.x2);
            minY = Math.min(minY, w.y1, w.y2);
            maxX = Math.max(maxX, w.x1, w.x2);
            maxY = Math.max(maxY, w.y1, w.y2);
        });
        return { minX, maxX, minY, maxY };
    }

    function farthestWallDistance(pt) {
        const b = floorBounds();
        const corners = [
            { x: b.minX, y: b.minY },
            { x: b.minX, y: b.maxY },
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY }
        ];
        let max = 0;
        corners.forEach(c => {
            const d = Math.hypot(c.x - pt.x, c.y - pt.y);
            if (d > max) max = d;
        });
        return max;
    }

    function lineClear(a, b, options = {}) {
        if (segmentIntersectsWall(a.x, a.y, b.x, b.y)) return false;
        if (options.avoidZones && segmentIntersectsAnyZone(a.x, a.y, b.x, b.y, options.excludeZone)) return false;
        return true;
    }

    function buildGraphForILP() {
        const step = gridSize / 5;
        const b = floorBounds();
        const minX = Math.floor(b.minX / step) - 2;
        const maxX = Math.ceil(b.maxX / step) + 2;
        const minY = Math.floor(b.minY / step) - 2;
        const maxY = Math.ceil(b.maxY / step) + 2;
        const nodes = [];
        const index = new Map();
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const px = x * step;
                const py = y * step;
                const idx = nodes.length;
                nodes.push({ x: px, y: py });
                index.set(`${x},${y}`, idx);
            }
        }
        const edges = [];
        function addEdge(x1,y1,x2,y2){
            const a = index.get(`${x1},${y1}`);
            const b = index.get(`${x2},${y2}`);
            if (a == null || b == null) return;
            const ax = x1 * step, ay = y1 * step;
            const bx = x2 * step, by = y2 * step;
            if (segmentIntersectsWall(ax, ay, bx, by)) return;
            edges.push({ a, b, len: step });
        }
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (x < maxX) addEdge(x, y, x + 1, y);
                if (y < maxY) addEdge(x, y, x, y + 1);
            }
        }
        return { step, nodes, edges };
    }

    function nearestNode(graph, pt) {
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < graph.nodes.length; i++) {
            const n = graph.nodes[i];
            const d = (n.x - pt.x) * (n.x - pt.x) + (n.y - pt.y) * (n.y - pt.y);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    function edgesToPath(graph, edgePairs, startIdx) {
        const map = new Map();
        edgePairs.forEach(([a,b]) => {
            if (!map.has(a)) map.set(a, []);
            map.get(a).push(b);
        });
        const path = [graph.nodes[startIdx]];
        let cur = startIdx;
        const maxSteps = edgePairs.length + 2;
        for (let step=0; step<maxSteps && map.has(cur) && map.get(cur).length; step++) {
            const next = map.get(cur).shift();
            path.push(graph.nodes[next]);
            cur = next;
        }
        return path;
    }

    function simplifyPath(path) {
        if (path.length <= 2) return path;
        const out = [path[0]];
        let prevDx = path[1].x - path[0].x;
        let prevDy = path[1].y - path[0].y;
        for (let i = 1; i < path.length - 1; i++) {
            const dx = path[i + 1].x - path[i].x;
            const dy = path[i + 1].y - path[i].y;
            if (dx * prevDy !== dy * prevDx) {
                out.push(path[i]);
                prevDx = dx;
                prevDy = dy;
            }
        }
        out.push(path[path.length - 1]);
        return out;
    }

    function findPath(start, end, options = {}) {
        const step = gridSize / 2;
        const bounds = floorBounds();
        const avoidZones = options.avoidZones;
        const excludeZone = options.excludeZone || null;

        function segmentBlocked(ax, ay, bx, by) {
            if (segmentIntersectsWall(ax, ay, bx, by)) return true;
            if (avoidZones && segmentIntersectsAnyZone(ax, ay, bx, by, excludeZone)) return true;
            return false;
        }

        if (!segmentBlocked(start.x, start.y, end.x, end.y)) {
            let direct = [start, end];
            direct = manhattanSimplify(direct, {avoidZones, excludeZone});
            direct = rdpSimplify(direct, (options.spacing || gridSize) / 2);
            return direct;
        }
        const limit = farthestWallDistance(start);
        const queue = [{ x: start.x, y: start.y, path: [start] }];
        const visited = new Set([
            `${Math.round(start.x/step)},${Math.round(start.y/step)}`
        ]);
        const dirs = [
            [ step, 0 ], [-step, 0 ],
            [ 0, step ], [0, -step],
            [ step, step ], [ step, -step ],
            [ -step, step ], [ -step, -step ]
        ];
        while (queue.length) {
            const n = queue.shift();
            if (Math.abs(n.x - end.x) < step/2 && Math.abs(n.y - end.y) < step/2) {
                n.path.push({ x: end.x, y: end.y });
                let res = simplifyPath(n.path);
                res = manhattanSimplify(res, {avoidZones, excludeZone});
                res = rdpSimplify(res, (options.spacing || gridSize) / 2);
                return res;
            }
            for (const [dx, dy] of dirs) {
                const nx = n.x + dx;
                const ny = n.y + dy;
                const key = `${Math.round(nx/step)},${Math.round(ny/step)}`;
                if (visited.has(key)) continue;
                if (segmentBlocked(n.x, n.y, nx, ny)) continue;
                if (nx < bounds.minX - step || nx > bounds.maxX + step || ny < bounds.minY - step || ny > bounds.maxY + step)
                    continue;
                if (Math.hypot(nx - start.x, ny - start.y) > limit)
                    continue;
                visited.add(key);
                queue.push({ x: nx, y: ny, path: n.path.concat([{ x: nx, y: ny }]) });
            }
        }
        return null;
    }

    function expandDiagonals(path, options = {}) {
        if (path.length <= 1) return path;
        const out = [path[0]];
        const avoidZones = options.avoidZones;
        const excludeZone = options.excludeZone || null;
        const block = (ax,ay,bx,by) => {
            if (segmentIntersectsWall(ax,ay,bx,by)) return true;
            if (avoidZones && segmentIntersectsAnyZone(ax,ay,bx,by,excludeZone)) return true;
            return false;
        };
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            if (dx !== 0 && dy !== 0) {
                const mid1 = { x: p2.x, y: p1.y };
                const mid2 = { x: p1.x, y: p2.y };
                if (!block(p1.x, p1.y, mid1.x, mid1.y) && !block(mid1.x, mid1.y, p2.x, p2.y)) {
                    out.push(mid1, p2);
                } else if (!block(p1.x, p1.y, mid2.x, mid2.y) && !block(mid2.x, mid2.y, p2.x, p2.y)) {
                    out.push(mid2, p2);
                } else {
                    out.push(p2);
                }
            } else {
                out.push(p2);
            }
        }
        return simplifyPath(out);
    }

    function drawPipePath(path, color, offset, dashed = []) {
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            const ox = -dy / len * offset;
            const oy = dx / len * offset;
            ctx.beginPath();
            ctx.moveTo(p1.x + ox, p1.y + oy);
            ctx.lineTo(p2.x + ox, p2.y + oy);
            if (dashed.includes(i)) {
                ctx.save();
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#800080';
                ctx.stroke();
                ctx.restore();
            } else {
                ctx.strokeStyle = color;
                ctx.stroke();
            }
        }
    }

    function pathLength(path) {
        let len = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            len += Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
        return len / pixelsPerMeter;
    }

    function pathValid(path, options = {}) {
        for (let i = 0; i < path.length - 1; i++) {
            if (segmentIntersectsWall(path[i].x, path[i].y, path[i+1].x, path[i+1].y)) {
                return false;
            }
            if (options.avoidZones && segmentIntersectsAnyZone(path[i].x, path[i].y, path[i+1].x, path[i+1].y, options.excludeZone)) {
                return false;
            }
        }
        return true;
    }

    function zoneCrossingIndices(path, excludeZone) {
        const indices = [];
        for (let i = 0; i < path.length - 1; i++) {
            for (const z of currentFloor.zones) {
                if (z === excludeZone) continue;
                if (pointInPolygon(path[i].x, path[i].y, z.points) || pointInPolygon(path[i+1].x, path[i+1].y, z.points) ||
                    segmentPolygonIntersections(path[i].x, path[i].y, path[i+1].x, path[i+1].y, z.points).length) {
                    indices.push(i);
                    break;
                }
            }
        }
        return Array.from(new Set(indices));
    }

    function segmentKey(a, b) {
        const ax = a.x.toFixed(2);
        const ay = a.y.toFixed(2);
        const bx = b.x.toFixed(2);
        const by = b.y.toFixed(2);
        if (ax < bx || (ax === bx && ay <= by)) {
            return `${ax},${ay},${bx},${by}`;
        }
        return `${bx},${by},${ax},${ay}`;
    }

    function drawWall(w, isSelected) {
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const len = Math.hypot(dx, dy) || 1;
        const doors = (w.doors || []).slice().sort((a,b)=> (a.offset - a.width/2) - (b.offset - b.width/2));
        const thickness = w.thickness || defaultWallThickness;
        let last = 0;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        for (let i=0;i<=doors.length;i++) {
            const segEnd = i<doors.length ? doors[i].offset - doors[i].width/2 : len;
            if (segEnd > last) {
                const sx = w.x1 + dx * (last/len);
                const sy = w.y1 + dy * (last/len);
                const ex = w.x1 + dx * (segEnd/len);
                const ey = w.y1 + dy * (segEnd/len);
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = thickness;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                ctx.strokeStyle = isSelected ? 'red' : '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
            if (i<doors.length) {
                const d = doors[i];
                const ds = d.offset - d.width/2;
                const de = d.offset + d.width/2;
                const sx = w.x1 + dx * (ds/len);
                const sy = w.y1 + dy * (ds/len);
                const ex = w.x1 + dx * (de/len);
                const ey = w.y1 + dy * (de/len);
                const half = thickness / 2;
                const ux = dx / len;
                const uy = dy / len;
                const nx = -uy * half;
                const ny = ux * half;
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = (d === selectedDoor) ? 'orange' : '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sx+nx, sy+ny);
                ctx.lineTo(ex+nx, ey+ny);
                ctx.lineTo(ex-nx, ey-ny);
                ctx.lineTo(sx-nx, sy-ny);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                last = de;
            }
        }
    }

    // Create a serpentine loop for a rectangular area. The loop starts
    // at `entry`, winds back and forth inside `rect`, and returns to the
    // entry point. The first serpentine segment begins from the entry
    // side rather than a corner so the layout looks more natural when
    // pipes enter through a doorway.
    function zoneLoopRect(rect, spacing, entry, orientation) {
        const path = [{ x: entry.x, y: entry.y }];
        const clearance = Math.max(spacing, entryClearance);
        const inner = {
            x: rect.x + clearance,
            y: rect.y + clearance,
            width: rect.width - clearance * 2,
            height: rect.height - clearance * 2
        };
        if (inner.width <= 0 || inner.height <= 0) {
            path.push({ x: entry.x, y: entry.y });
            return path;
        }

        const eps = clearance / 2;
        const onTop = Math.abs(entry.y - rect.y) < eps;
        const onBottom = Math.abs(entry.y - (rect.y + rect.height)) < eps;
        const onLeft = Math.abs(entry.x - rect.x) < eps;
        const onRight = Math.abs(entry.x - (rect.x + rect.width)) < eps;
        const horizontal = orientation === 'horizontal';

        if (horizontal) {
            // move inside by one spacing
            let y = onTop ? inner.y : inner.y + inner.height;
            path.push({ x: entry.x, y });
            // approach the nearest side to begin the serpentine
            const leftX = inner.x;
            const rightX = inner.x + inner.width;
            let x =
                Math.abs(entry.x - leftX) <= Math.abs(entry.x - rightX)
                    ? leftX
                    : rightX;
            if (x !== entry.x) path.push({ x, y });
            let dirRight = x === leftX;
            while (true) {
                const targetX = dirRight ? rightX : leftX;
                path.push({ x: targetX, y });
                const nextY = onTop ? y + spacing : y - spacing;
                if (nextY < inner.y || nextY > inner.y + inner.height) break;
                path.push({ x: targetX, y: nextY });
                y = nextY;
                dirRight = !dirRight;
            }
        } else {
            // entry on left or right edge
            let x = onLeft ? inner.x : inner.x + inner.width;
            path.push({ x, y: entry.y });
            const topY = inner.y;
            const botY = inner.y + inner.height;
            let y =
                Math.abs(entry.y - topY) <= Math.abs(entry.y - botY)
                    ? topY
                    : botY;
            if (y !== entry.y) path.push({ x, y });
            let dirDown = y === topY;
            while (true) {
                const targetY = dirDown ? botY : topY;
                path.push({ x, y: targetY });
                const nextX = onLeft ? x + spacing : x - spacing;
                if (nextX < inner.x || nextX > inner.x + inner.width) break;
                path.push({ x: nextX, y: targetY });
                x = nextX;
                dirDown = !dirDown;
            }
        }

        // Return to the entry point to close the circuit
        const last = path[path.length - 1];
        if (last.x !== entry.x || last.y !== entry.y) {
            path.push({ x: entry.x, y: last.y });
            path.push({ x: entry.x, y: entry.y });
        }
        return path;
    }

    // Generate a serpentine loop for a polygonal zone by creating a
    // rectangular loop and clipping it to the polygon. The resulting
    // path always starts and ends at the entry point so the circuit is
    // closed even when clipping removes outer segments.
    function zoneLoopPath(zone, spacing, entry) {
        const safePoly = offsetPolygon(zone.points, -(spacing + pipeDiameter));
        const poly = safePoly.length >= 3 ? safePoly : zone.points;

        const angle = dominantAxisAngle(poly);
        const c = polygonCentroid(poly);
        const rotPoly = poly.map(p => rotatePoint(p, -angle, c));
        const rotEntry = rotatePoint(entry, -angle, c);
        const rect = zoneBounds({points: rotPoly});
        const orient = rect.width >= rect.height ? 'horizontal' : 'vertical';
        const rawRot = zoneLoopRect(rect, spacing, rotEntry, orient);
        const raw = rawRot.map(p => rotatePoint(p, angle, c));
        let clipped = clipPathToPolygon(raw, poly);
        if (!clipped.length) clipped = raw.slice();
        const eps = 1e-6;
        const start = { x: entry.x, y: entry.y };
        if (Math.hypot(clipped[0].x - start.x, clipped[0].y - start.y) > eps) {
            clipped.unshift(start);
        }
        const last = clipped[clipped.length - 1];
        if (Math.hypot(last.x - start.x, last.y - start.y) > eps) {
            clipped.push(start);
        }
        return simplifyPath(clipped);
    }

    // Adjust wall endpoints so nearby walls meet seamlessly
    function connectWalls() {
        if (!currentFloor) return;
        const threshBase = SNAP_DIST;
        for (let i = 0; i < currentFloor.walls.length; i++) {
            const a = currentFloor.walls[i];
            const ta = a.thickness || defaultWallThickness;
            const endpoints = [
                { key: 'x1', keyy: 'y1' },
                { key: 'x2', keyy: 'y2' }
            ];
            endpoints.forEach(ep => {
                let ex = a[ep.key];
                let ey = a[ep.keyy];
                for (let j = 0; j < currentFloor.walls.length; j++) {
                    if (i === j) continue;
                    const b = currentFloor.walls[j];
                    const tb = b.thickness || defaultWallThickness;
                    const thresh = Math.max(ta, tb) / 2 + threshBase;
                    // snap to other wall endpoints
                    const pts = [ {x:b.x1,y:b.y1}, {x:b.x2,y:b.y2} ];
                    pts.forEach(p => {
                        if (Math.hypot(p.x - ex, p.y - ey) < thresh) {
                            ex = p.x;
                            ey = p.y;
                        }
                    });
                    // snap to nearest point on wall segment
                    const t = projectionOnSegment(ex, ey, b.x1, b.y1, b.x2, b.y2);
                    const px = b.x1 + (b.x2 - b.x1) * t;
                    const py = b.y1 + (b.y2 - b.y1) * t;
                    if (Math.hypot(px - ex, py - ey) < thresh) {
                        ex = px;
                        ey = py;
                    }
                }
                a[ep.key] = ex;
                a[ep.keyy] = ey;
            });
        }
    }

    function drawWallJoints() {
        const joints = {};
        currentFloor.walls.forEach(w => {
            const thick = w.thickness || defaultWallThickness;
            [
                { x: w.x1, y: w.y1, thick },
                { x: w.x2, y: w.y2, thick }
            ].forEach(pt => {
                const key = pt.x + ',' + pt.y;
                if (!joints[key]) joints[key] = { x: pt.x, y: pt.y, max: 0, count: 0 };
                joints[key].max = Math.max(joints[key].max, pt.thick);
                joints[key].count += 1;
            });
        });
        ctx.fillStyle = '#ccc';
        ctx.strokeStyle = '#000';
        for (const key in joints) {
            const j = joints[key];
            if (j.count < 2) continue;
            const size = j.max;
            ctx.beginPath();
            ctx.rect(j.x - size/2, j.y - size/2, size, size);
            ctx.fill();
            ctx.stroke();
        }
    }


    function screenToWorld(x, y) {
        return { x: (x - offsetX) / scale, y: (y - offsetY) / scale };
    }

    function worldToPlan(pt) {
        const bg = currentFloor && currentFloor.background;
        if (!bg) return pt;
        let x = pt.x - bg.offsetX;
        let y = pt.y - bg.offsetY;
        const cos = Math.cos(-bg.rotation);
        const sin = Math.sin(-bg.rotation);
        const nx = x * cos - y * sin;
        const ny = x * sin + y * cos;
        return { x: nx / bg.scale, y: ny / bg.scale };
    }

    function planToWorld(pt) {
        const bg = currentFloor && currentFloor.background;
        if (!bg) return pt;
        let x = pt.x * bg.scale;
        let y = pt.y * bg.scale;
        const cos = Math.cos(bg.rotation);
        const sin = Math.sin(bg.rotation);
        const nx = x * cos - y * sin;
        const ny = x * sin + y * cos;
        return { x: nx + bg.offsetX, y: ny + bg.offsetY };
    }

    function hitTestZone(x, y) {
        if (!layers.zones.visible) return null;
        for (let i = currentFloor.zones.length - 1; i >= 0; i--) {
            const r = currentFloor.zones[i];
            if (pointInPolygon(x, y, r.points)) {
                return r;
            }
        }
        return null;
    }

    function pointInRect(p, pts) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y;
            const xj = pts[j].x, yj = pts[j].y;
            const intersect = ((yi > p.y) !== (yj > p.y)) &&
                (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function hitTestDistributor(x, y) {
        if (!layers.distributors.visible) return null;
        for (let i = currentFloor.distributors.length - 1; i >= 0; i--) {
            const d = currentFloor.distributors[i];
            const pts = distributorCorners(d);
            if (pointInRect({x, y}, pts)) {
                return d;
            }
        }
        return null;
    }

    function hitTestDoor(x, y) {
        if (!layers.walls.visible) return null;
        for (let wi = currentFloor.walls.length - 1; wi >= 0; wi--) {
            const w = currentFloor.walls[wi];
            const len = wallLength(w);
            const ux = (w.x2 - w.x1) / len;
            const uy = (w.y2 - w.y1) / len;
            const perp = Math.abs((x - w.x1) * -uy + (y - w.y1) * ux);
            if (perp > (w.thickness || defaultWallThickness) / 2 + SNAP_DIST) continue;
            const proj = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2) * len;
            for (let di = (w.doors||[]).length -1; di >=0; di--) {
                const d = w.doors[di];
                if (proj >= d.offset - d.width/2 - SNAP_DIST && proj <= d.offset + d.width/2 + SNAP_DIST) {
                    return {wall:w, door:d};
                }
            }
        }
        return null;
    }

    function hitTestPipe(x, y) {
        if (!layers.pipes.visible) return null;
        for (let i = currentFloor.pipes.length - 1; i >= 0; i--) {
            const p = currentFloor.pipes[i];
            const paths = [p.supplyPath, p.returnPath];
            for (const path of paths) {
                for (let j = 0; j < path.length - 1; j++) {
                    if (distanceToSegment(x, y, path[j].x, path[j].y, path[j+1].x, path[j+1].y) < SNAP_DIST) {
                        return p;
                    }
                }
            }
        }
        return null;
    }

    canvas.addEventListener('mousedown', e => {
        if (!currentFloor) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        if (settingPlanRef) {
            planRefPoints.push(world);
            if (planRefPoints.length === 2) {
                const dist = parseFloat(prompt('Distance between points (m)?', '1'));
                if (!isNaN(dist)) {
                    applyReference(planRefPoints[0], planRefPoints[1], dist);
                }
                planRefPoints = [];
                settingPlanRef = false;
                planDialog.style.display = 'block';
                drawAll();
            }
            return;
        }
        if (mode === 'pan') {
            startX = sx;
            startY = sy;
            drawing = true;
            return;
        }
        startX = world.x;
        startY = world.y;
        if (mode === 'wall') {
            if (layers.walls.locked) return;
            const snap = snapToPoints(startX, startY);
            if (!wallStart) {
                wallStart = snap;
            } else {
                const ang = snapAngle(snap.x - wallStart.x, snap.y - wallStart.y);
                const end = snapToPoints(wallStart.x + ang.dx, wallStart.y + ang.dy);
                currentFloor.walls.push({
                    x1: wallStart.x,
                    y1: wallStart.y,
                    x2: end.x,
                    y2: end.y,
                    thickness: defaultWallThickness,
                    doors: []
                });
                wallStart = end;
                typedLength = '';
                connectWalls();
                scheduleHistory();
            }
            drawAll();
            return;
        } else if (mode === 'zone') {
            if (layers.zones.locked) return;
            const snap = snapToPoints(startX, startY);
            if (!zoneDrawing) {
                zoneDrawing = [snap];
            } else if (zoneDrawing.length >= 2 && Math.hypot(snap.x - zoneDrawing[0].x, snap.y - zoneDrawing[0].y) < SNAP_DIST) {
                const name = prompt('Zone name?', `Zone ${currentFloor.zones.length + 1}`) || '';
                const spacingMm = parseInt(prompt('Pipe spacing (mm)?', spacingInput.value), 10) || parseInt(spacingInput.value, 10) || 0;
                const spacing = spacingMm / 1000 * pixelsPerMeter;
                let distributorId = null;
                if (currentFloor.distributors.length > 0) {
                    const list = currentFloor.distributors.map((d,i)=>`${i}: ${d.name}`).join('\n');
                    const ans = prompt('Distributor index:\n' + list, '0');
                    const idx = parseInt(ans, 10);
                    if (!isNaN(idx) && currentFloor.distributors[idx]) distributorId = idx;
                }
                const points = zoneDrawing.slice();
                currentFloor.zones.push({ points, name, spacing, distributorId, manualPath: null });
                zoneDrawing = null;
                scheduleHistory();
            } else {
                zoneDrawing.push(snap);
            }
            drawAll();
            return;
        } else if (mode === 'pipe') {
            if (layers.pipes.locked) return;
            const snap = snapToPipePoints(startX, startY);
            if (!pipeDrawing) {
                const dist = hitTestDistributor(startX, startY);
                if (!dist) return;
                const id = currentFloor.distributors.indexOf(dist);
                const idx = dist.nextPort || 0;
                const start = distributorPort(dist, idx);
                pipeDrawing = { distributorId: id, portIndex: idx, points: [start] };
            } else {
                const prev = pipeDrawing.points[pipeDrawing.points.length-1];
                const ang = snapAngle(snap.x - prev.x, snap.y - prev.y);
                const end = snapToPipePoints(prev.x + ang.dx, prev.y + ang.dy);
                pipeDrawing.points.push({x:end.x, y:end.y});
                const zone = hitTestZone(end.x, end.y);
                if (zone) {
                    pipeDrawing.points[pipeDrawing.points.length-1] = closestPointOnZone(zone, end.x, end.y);
                    zone.manualPath = pipeDrawing.points.slice();
                    zone.distributorId = pipeDrawing.distributorId;
                    const d = currentFloor.distributors[pipeDrawing.distributorId];
                    if (d) d.nextPort = (pipeDrawing.portIndex || 0) + 1;
                    pipeDrawing = null;
                    scheduleHistory();
                    drawAll();
                    return;
                }
            }
            drawAll();
            return;
        } else if (mode === 'distributor') {
            if (layers.distributors.locked) return;
            const width = parseFloat(prompt('Width (m)?', '0.3')) || 0.3;
            const height = parseFloat(prompt('Depth (m)?', '0.1')) || 0.1;
            const pxWidth = width * pixelsPerMeter;
            const pxHeight = height * pixelsPerMeter;
            const name = prompt('Name?', `D${currentFloor.distributors.length + 1}`) || '';
            const connections = parseInt(prompt('Connections?', '2'), 10) || 2;
            const minWidth = (connections + 1) * PORT_SPACING;
            const finalWidth = Math.max(pxWidth, minWidth);
            const hit = wallHitInfo(startX, startY);
            const distObj = { width: finalWidth, height: pxHeight, name, connections, nextPort: 0 };
            if (hit) {
                Object.assign(distObj, { wallId: hit.index, offset: hit.along, sign: hit.sign });
            } else {
                Object.assign(distObj, { x: startX, y: startY });
            }
            currentFloor.distributors.push(distObj);
            updateDistributorList();
            scheduleHistory();
            drawAll();
        } else if (mode === 'door') {
            const hit = hitTestWall(startX, startY);
            if (hit.wall) {
                const w = hit.wall;
                const len = wallLength(w);
                const proj = projectionOnSegment(startX, startY, w.x1, w.y1, w.x2, w.y2) * len;
                const door = { offset: proj, width: 1 * pixelsPerMeter };
                w.doors = w.doors || [];
                w.doors.push(door);
                scheduleHistory();
                drawAll();
            }
        } else if (mode === 'select') {
            const d = hitTestDistributor(startX, startY);
            const hit = hitTestWall(startX, startY);
            if (d && !layers.distributors.locked) {
                selectedDistributor = d;
                selectedZone = null;
                selectedWall = null;
                selectedDoor = null;
                selectedPipe = null;
                dragMode = 'moveDistributor';
                drawing = true;
                updateDistributorList();
                drawAll();
            } else if (hit.wall && !layers.walls.locked) {
                selectedWall = hit.wall;
                selectedZone = null;
                selectedDistributor = null;
                selectedDoor = null;
                selectedPipe = null;
                dragMode = hit.mode;
                drawing = true;
                lengthInput.disabled = false;
                lengthInput.value = wallLengthMeters(selectedWall).toFixed(2);
                wallThicknessInput.disabled = false;
                wallThicknessInput.value = (selectedWall.thickness||defaultWallThickness)/pixelsPerMeter;
            } else {
                selectedWall = null;
                lengthInput.value = '';
                lengthInput.disabled = true;
                wallThicknessInput.value = '';
                wallThicknessInput.disabled = true;
                const r = layers.zones.locked ? null : hitTestZone(startX, startY);
                const d2 = layers.distributors.locked ? null : hitTestDistributor(startX, startY);
                const doorHit = layers.walls.locked ? null : hitTestDoor(startX, startY);
                const p = layers.pipes.locked ? null : hitTestPipe(startX, startY);
                if (doorHit) {
                    selectedWall = doorHit.wall;
                    selectedDoor = doorHit.door;
                    dragMode = 'moveDoor';
                    drawing = true;
                    wallThicknessInput.disabled = false;
                    wallThicknessInput.value = (selectedWall.thickness||defaultWallThickness)/pixelsPerMeter;
                } else if (p) {
                    selectedPipe = p;
                    selectedZone = null;
                    selectedDistributor = null;
                    drawAll();
                } else if (r) {
                    selectedZone = r;
                    selectedDistributor = null;
                    dragMode = 'moveZone';
                    drawing = true;
                } else if (d2) {
                    selectedDistributor = d2;
                    selectedZone = null;
                    dragMode = 'moveDistributor';
                    drawing = true;
                    updateDistributorList();
                } else {
                    selectedZone = null;
                    selectedDistributor = null;
                    selectedDoor = null;
                    selectedPipe = null;
                    drawAll();
                }
            }
        }
    });

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const pos = screenToWorld(sx, sy);
        const x = pos.x;
        const y = pos.y;
        mouseWorld.x = x;
        mouseWorld.y = y;
        if (drawing) {
            if (mode === 'pan') {
                const dx = sx - startX;
                const dy = sy - startY;
                offsetX += dx;
                offsetY += dy;
                startX = sx;
                startY = sy;
                drawAll();
                return;
            }
            if (mode === 'select' && selectedWall) {
                if (dragMode === 'move') {
                    const dx = x - startX;
                    const dy = y - startY;
                    selectedWall.x1 += dx;
                    selectedWall.y1 += dy;
                    selectedWall.x2 += dx;
                    selectedWall.y2 += dy;
                    startX = x;
                    startY = y;
                    lengthInput.value = wallLengthMeters(selectedWall).toFixed(2);
                    drawAll();
                } else if (dragMode === 'end1' || dragMode === 'end2') {
                    const anchorX = dragMode === 'end1' ? selectedWall.x2 : selectedWall.x1;
                    const anchorY = dragMode === 'end1' ? selectedWall.y2 : selectedWall.y1;
                    const snap = snapAngle(x - anchorX, y - anchorY);
                    const snapped = snapToPoints(anchorX + snap.dx, anchorY + snap.dy);
                    if (dragMode === 'end1') {
                        selectedWall.x1 = snapped.x;
                        selectedWall.y1 = snapped.y;
                    } else {
                        selectedWall.x2 = snapped.x;
                        selectedWall.y2 = snapped.y;
                    }
                    lengthInput.value = wallLengthMeters(selectedWall).toFixed(2);
                    drawAll();
                }
            } else if (mode === 'select' && selectedZone && dragMode === 'moveZone') {
                const dx = x - startX;
                const dy = y - startY;
                selectedZone.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
                startX = x;
                startY = y;
                drawAll();
            } else if (mode === 'select' && selectedDistributor && dragMode === 'moveDistributor') {
                if (selectedDistributor.wallId != null) {
                    const w = currentFloor.walls[selectedDistributor.wallId];
                    const len = wallLength(w);
                    const t = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
                    selectedDistributor.offset = t * len;
                    const ux = (w.x2 - w.x1) / len;
                    const uy = (w.y2 - w.y1) / len;
                    const nx = -uy;
                    const ny = ux;
                    const px = w.x1 + ux * selectedDistributor.offset;
                    const py = w.y1 + uy * selectedDistributor.offset;
                    selectedDistributor.sign = ((x - px) * nx + (y - py) * ny) >= 0 ? 1 : -1;
                } else {
                    const dx = x - startX;
                    const dy = y - startY;
                    selectedDistributor.x += dx;
                    selectedDistributor.y += dy;
                    startX = x;
                    startY = y;
                }
                startX = x;
                startY = y;
                drawAll();
            } else if (mode === 'select' && selectedDoor && dragMode === 'moveDoor') {
                const w = selectedWall;
                const len = wallLength(w);
                const proj = projectionOnSegment(x, y, w.x1, w.y1, w.x2, w.y2) * len;
                selectedDoor.offset = proj;
                startX = x;
                startY = y;
                drawAll();
            }
        } else {
            // just update preview
            drawAll();
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (!drawing) return;
        drawing = false;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const pos = screenToWorld(sx, sy);
        const x = pos.x;
        const y = pos.y;
        if (mode === 'pan') {
            return;
        }
        if (mode === 'select') {
            lengthInput.value = selectedWall ? wallLengthMeters(selectedWall).toFixed(2) : '';
        }
        dragMode = null;
        connectWalls();
        scheduleHistory();
        drawAll();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const zoom = e.deltaY < 0 ? 1.1 : 0.9;
        scale = Math.min(5, Math.max(0.2, scale * zoom));
        offsetX = sx - world.x * scale;
        offsetY = sy - world.y * scale;
        drawAll();
    }, { passive: false });

    generatePipesBtn.addEventListener('click', generatePipes);
    manualPipeBtn.addEventListener('click', () => setMode('pipe'));
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    exportBtn.addEventListener('click', exportPlan);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleImport);
    importPlanBtn.addEventListener('click', () => planImageInput.click());
    planImageInput.addEventListener('change', handlePlanImage);
    setPlanRefBtn.addEventListener('click', () => { settingPlanRef = true; planRefPoints = []; planDialog.style.display = 'none'; });
    closePlanDialog.addEventListener('click', () => { planDialog.style.display = 'none'; drawAll(); });
    planOpacity.addEventListener('input', () => { if (currentFloor && currentFloor.background) { currentFloor.background.opacity = parseFloat(planOpacity.value); drawAll(); } });
    fixWallsBtn.addEventListener('click', () => { connectWalls(); drawAll(); });
    helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) toggleHelp(); });

    layerPanel.addEventListener('click', e => {
        const item = e.target.closest('.layer-item');
        if (!item) return;
        const name = item.dataset.layer;
        const state = layers[name];
        if (e.target.classList.contains('eye')) {
            if (e.altKey) {
                Object.keys(layers).forEach(k => layers[k].visible = k === name);
            } else {
                state.visible = !state.visible;
            }
        } else if (e.target.classList.contains('lock')) {
            state.locked = !state.locked;
        }
        updateLayerPanel();
        drawAll();
    });

    canvas.addEventListener('dblclick', e => {
        if (!currentFloor) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const pos = screenToWorld(sx, sy);
        const x = pos.x;
        const y = pos.y;
        const r = hitTestZone(x, y);
        const d = hitTestDistributor(x, y);
        const doorHit = hitTestDoor(x, y);
        if (r) {
            r.name = prompt('Zone name?', r.name || '') || r.name;
            const spacingMm = parseInt(prompt('Pipe spacing (mm)?', Math.round(r.spacing / pixelsPerMeter * 1000)), 10);
            if (!isNaN(spacingMm)) r.spacing = spacingMm / 1000 * pixelsPerMeter;
            if (currentFloor.distributors.length > 0) {
                const list = currentFloor.distributors.map((d,i)=>`${i}: ${d.name}`).join('\n');
                const ans = prompt('Distributor index:\n' + list, r.distributorId ?? '');
                const idx = parseInt(ans, 10);
                if (!isNaN(idx) && currentFloor.distributors[idx]) r.distributorId = idx;
            }
            scheduleHistory();
            drawAll();
        } else if (d) {
            d.name = prompt('Name?', d.name || '') || d.name;
            const width = parseFloat(prompt('Width (m)?', (d.width/pixelsPerMeter).toFixed(2)), 10);
            const depth = parseFloat(prompt('Depth (m)?', (d.height/pixelsPerMeter).toFixed(2)), 10);
            const connections = parseInt(prompt('Connections?', d.connections), 10);
            if (!isNaN(width)) d.width = width * pixelsPerMeter;
            if (!isNaN(depth)) d.height = depth * pixelsPerMeter;
            if (!isNaN(connections)) d.connections = connections;
            const minW = (d.connections + 1) * PORT_SPACING;
            if (d.width < minW) d.width = minW;
            scheduleHistory();
            drawAll();
        } else if (doorHit) {
            const newWidth = parseFloat(prompt('Door width (m)?', (doorHit.door.width / pixelsPerMeter).toFixed(2)), 10);
            if (!isNaN(newWidth)) doorHit.door.width = newWidth * pixelsPerMeter;
            scheduleHistory();
            drawAll();
        }
    });

    // initialise with one floor
    addFloor('Floor 1');
    setMode('select');
    resizeCanvas();
    updateLayerPanel();
    pushHistoryNow();
});
