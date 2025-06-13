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
    const drawPipesBtn = document.getElementById('drawPipesBtn');
    const exportBtn = document.getElementById('exportBtn');
    const fixWallsBtn = document.getElementById('fixWallsBtn');
    const spacingInput = document.getElementById('pipeSpacing');
    const lengthInput = document.getElementById('lineLength');
    const wallThicknessInput = document.getElementById('wallThickness');

    const toolButtons = {};

    Object.assign(toolButtons, {
        wall: drawWallBtn,
        zone: drawZoneBtn,
        distributor: addDistributorBtn,
        door: addDoorBtn,
        select: selectBtn,
        pan: panBtn
    });

    const gridSize = 38; // grid spacing in pixels (0.5 m)
    let pixelsPerMeter = gridSize * 2; // 0.5 m per grid square
    let defaultWallThickness = 0.25 * pixelsPerMeter;
    let entryClearance = 0.15 * pixelsPerMeter; // keep pipes ~15cm from walls
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

    function setMode(m) {
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
            pipes: []
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
                drawAll();
            });
            distributorList.appendChild(li);
        });
    }

    addFloorBtn.addEventListener('click', () => {
        const name = prompt('Floor name?', `Floor ${floors.length + 1}`);
        if (name) {
            addFloor(name);
            drawAll();
        }
    });

    renameFloorBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        const name = prompt('Floor name?', currentFloor.name);
        if (name) {
            currentFloor.name = name;
            updateFloorList();
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
            selectedDistributor.name = name;
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
        drawAll();
    }

    deleteBtn.addEventListener('click', deleteSelected);
    deleteDistributorBtn.addEventListener('click', () => {
        if (!selectedDistributor) return;
        deleteSelected();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Delete') {
            deleteSelected();
        } else if (e.key === 'Escape') {
            if (mode === 'wall') {
                wallStart = null;
                drawAll();
            } else if (mode === 'zone') {
                zoneDrawing = null;
                drawAll();
            }
        }
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
        drawAll();
    });

    wallThicknessInput.addEventListener('change', () => {
        if (!selectedWall) return;
        const th = parseFloat(wallThicknessInput.value);
        if (isNaN(th)) return;
        selectedWall.thickness = th * pixelsPerMeter;
        drawAll();
    });

    function drawGrid() {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();

        const left = -offsetX;
        const right = canvas.width - offsetX;
        const top = -offsetY;
        const bottom = canvas.height - offsetY;

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

    function drawAll() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        ctx.save();
        ctx.translate(offsetX, offsetY);
        if (!currentFloor) { ctx.restore(); return; }
        ctx.strokeStyle = '#000';
        // walls
        currentFloor.walls.forEach(w => {
            drawWall(w, w === selectedWall);
        });
        drawWallJoints();
        ctx.strokeStyle = '#000';
        // zones
        currentFloor.zones.forEach(z => {
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
        if (zoneDrawing && mode === 'zone') {
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

        let previewSnap = null;
        if (mode === 'wall') {
            previewSnap = snapToPoints(mouseWorld.x, mouseWorld.y);
        }

        if (wallStart && mode === 'wall') {
            const ang = snapAngle(previewSnap.x - wallStart.x, previewSnap.y - wallStart.y);
            const end = snapToPoints(wallStart.x + ang.dx, wallStart.y + ang.dy);
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(wallStart.x, wallStart.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }

        if (mode === 'wall' && previewSnap && previewSnap.snapped) {
            ctx.strokeStyle = 'orange';
            ctx.beginPath();
            ctx.arc(previewSnap.x, previewSnap.y, 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        // distributors
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

        // pipes
        currentFloor.pipes.forEach(p => {
            const base = PARALLEL_OFFSET * 2 * (p.parallelIndex || 0);
            drawPipePath(p.supplyPath, p === selectedPipe ? 'orange' : 'red', base);
            drawPipePath(p.returnPath, p === selectedPipe ? 'orange' : 'blue', base + PARALLEL_OFFSET);
        });
        ctx.restore();
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
        currentFloor.pipes = [];
        const segmentCounts = new Map();
        currentFloor.zones.forEach(zone => {
            const rect = zoneBounds(zone);
            const defSpacing = (parseInt(spacingInput.value, 10) || 0) / 1000 * pixelsPerMeter;
            const spacing = zone.spacing || defSpacing || gridSize;
            const dist = currentFloor.distributors[zone.distributorId || 0];
            if (!dist) return;

            const distPos = distributorPort(dist);
            const entry = entryPointForZone(zone, distPos);
            let toEntry = findPath({ x: distPos.x, y: distPos.y }, entry);
            if (!toEntry) {
                alert(`No path found from distributor "${dist.name}" to zone "${zone.name}"`);
                return;
            }
            toEntry = expandDiagonals(toEntry);
            if (!pathValid(toEntry)) {
                alert(`No path found from distributor "${dist.name}" to zone "${zone.name}"`);
                return;
            }
            const zonePath = zoneLoopPath(zone, spacing, entry);

            const supplyPath = toEntry.concat(zonePath);
            const returnPath = toEntry.slice().reverse();

            if (!pathValid(supplyPath) || !pathValid(returnPath)) {
                alert(`Pipe layout for zone "${zone.name}" intersects a wall`);
                return;
            }

            const length = pathLength(supplyPath) + pathLength(returnPath);

            let parallelIndex = 0;
            for (let i = 0; i < toEntry.length - 1; i++) {
                const key = segmentKey(toEntry[i], toEntry[i+1]);
                const count = segmentCounts.get(key) || 0;
                if (count > parallelIndex) parallelIndex = count;
            }

            currentFloor.pipes.push({ zone, distributor: dist, supplyPath, returnPath, length, parallelIndex });

            for (let i = 0; i < toEntry.length - 1; i++) {
                const key = segmentKey(toEntry[i], toEntry[i+1]);
                segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
            }
        });
        drawAll();
    }

    function exportPlan() {
        if (!currentFloor) return;
        drawAll();
        const png = canvas.toDataURL('image/png');
        const data = currentFloor.pipes.map(p => ({
            zone: p.zone.name || '',
            distributor: p.distributor.name || '',
            length_m: p.length.toFixed(2)
        }));
        const json = JSON.stringify({ pipes: data }, null, 2);
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
        URL.revokeObjectURL(url);
    }

    const SNAP_DIST = 10;
    // Distance in pixels between adjacent pipes in a shared corridor
    const PARALLEL_OFFSET = 6;

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

    function wallLength(w) {
        return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    }

    function wallLengthMeters(w) {
        return wallLength(w) / pixelsPerMeter;
    }

    function hitTestWall(x, y) {
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

    function distributorPort(d) {
        if (d.wallId != null) {
            const w = currentFloor.walls[d.wallId];
            if (!w) return { x: d.x, y: d.y };
            const len = wallLength(w);
            const ux = (w.x2 - w.x1) / len;
            const uy = (w.y2 - w.y1) / len;
            const nx = -uy;
            const ny = ux;
            const thick = w.thickness || defaultWallThickness;
            return {
                x: w.x1 + ux * d.offset + nx * d.sign * (thick / 2),
                y: w.y1 + uy * d.offset + ny * d.sign * (thick / 2)
            };
        }
        return { x: d.x, y: d.y };
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

    function lineClear(a, b) {
        return !segmentIntersectsWall(a.x, a.y, b.x, b.y);
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

    function findPath(start, end) {
        const step = gridSize / 2;
        const bounds = floorBounds();
        if (lineClear(start, end)) return [start, end];
        const limit = farthestWallDistance(start) + step * 4;
        const TURN_PENALTY = step * 0.2;
        const open = [{ x: start.x, y: start.y, g: 0, path: [start], dir: null }];
        const visited = new Set([
            `${Math.round(start.x/step)},${Math.round(start.y/step)}`
        ]);
        const gx = end.x;
        const gy = end.y;
        const dirs = [
            [ step, 0, step, 'E' ], [-step, 0, step, 'W' ],
            [ 0, step, step, 'S' ], [0, -step, step, 'N' ],
            [ step, step, Math.SQRT2 * step, 'SE' ],
            [ step, -step, Math.SQRT2 * step, 'NE' ],
            [ -step, step, Math.SQRT2 * step, 'SW' ],
            [ -step, -step, Math.SQRT2 * step, 'NW' ]
        ];
        function heuristic(x,y) {
            return Math.abs(x - gx) + Math.abs(y - gy);
        }
        while (open.length) {
            open.sort((a,b)=> (a.g + heuristic(a.x,a.y)) - (b.g + heuristic(b.x,b.y)));
            const n = open.shift();
            if (Math.abs(n.x - gx) < step/2 && Math.abs(n.y - gy) < step/2) {
                n.path.push({ x: end.x, y: end.y });
                return simplifyPath(n.path);
            }
            for (const [dx, dy, cost, dname] of dirs) {
                const nx = n.x + dx;
                const ny = n.y + dy;
                const key = `${Math.round(nx/step)},${Math.round(ny/step)}`;
                if (visited.has(key)) continue;
                if (segmentIntersectsWall(n.x, n.y, nx, ny)) continue;
                if (nx < bounds.minX - step || nx > bounds.maxX + step || ny < bounds.minY - step || ny > bounds.maxY + step)
                    continue;
                if (Math.hypot(nx - start.x, ny - start.y) > limit)
                    continue;
                visited.add(key);
                const turn = n.dir && n.dir !== dname ? TURN_PENALTY : 0;
                open.push({ x: nx, y: ny, g: n.g + cost + turn, path: n.path.concat([{ x: nx, y: ny }]), dir: dname });
            }
        }
        return null;
    }

    function expandDiagonals(path) {
        if (path.length <= 1) return path;
        const out = [path[0]];
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            if (dx !== 0 && dy !== 0) {
                const mid1 = { x: p2.x, y: p1.y };
                const mid2 = { x: p1.x, y: p2.y };
                if (!segmentIntersectsWall(p1.x, p1.y, mid1.x, mid1.y) && !segmentIntersectsWall(mid1.x, mid1.y, p2.x, p2.y)) {
                    out.push(mid1, p2);
                } else if (!segmentIntersectsWall(p1.x, p1.y, mid2.x, mid2.y) && !segmentIntersectsWall(mid2.x, mid2.y, p2.x, p2.y)) {
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

    function drawPipePath(path, color, offset) {
        ctx.strokeStyle = color;
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
            ctx.stroke();
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

    function pathValid(path) {
        for (let i = 0; i < path.length - 1; i++) {
            if (segmentIntersectsWall(path[i].x, path[i].y, path[i+1].x, path[i+1].y)) {
                return false;
            }
        }
        return true;
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
        const rect = zoneBounds(zone);
        const orientation = rect.width >= rect.height ? 'horizontal' : 'vertical';
        const raw = zoneLoopRect(rect, spacing, entry, orientation);
        let clipped = clipPathToPolygon(raw, zone.points);
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
        return { x: x - offsetX, y: y - offsetY };
    }

    function hitTestZone(x, y) {
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
        if (mode === 'pan') {
            startX = sx;
            startY = sy;
            drawing = true;
            return;
        }
        startX = world.x;
        startY = world.y;
        if (mode === 'wall') {
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
                connectWalls();
            }
            drawAll();
            return;
        } else if (mode === 'zone') {
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
                currentFloor.zones.push({ points, name, spacing, distributorId });
                zoneDrawing = null;
            } else {
                zoneDrawing.push(snap);
            }
            drawAll();
            return;
        } else if (mode === 'distributor') {
            const width = parseFloat(prompt('Width (m)?', '0.3')) || 0.3;
            const height = parseFloat(prompt('Depth (m)?', '0.1')) || 0.1;
            const pxWidth = width * pixelsPerMeter;
            const pxHeight = height * pixelsPerMeter;
            const name = prompt('Name?', `D${currentFloor.distributors.length + 1}`) || '';
            const connections = parseInt(prompt('Connections?', '2'), 10) || 2;
            const hit = wallHitInfo(startX, startY);
            if (hit) {
                currentFloor.distributors.push({ wallId: hit.index, offset: hit.along, sign: hit.sign, width: pxWidth, height: pxHeight, name, connections });
            } else {
                currentFloor.distributors.push({ x: startX, y: startY, width: pxWidth, height: pxHeight, name, connections });
            }
            updateDistributorList();
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
                drawAll();
            }
        } else if (mode === 'select') {
            const d = hitTestDistributor(startX, startY);
            const hit = hitTestWall(startX, startY);
            if (d) {
                selectedDistributor = d;
                selectedZone = null;
                selectedWall = null;
                selectedDoor = null;
                selectedPipe = null;
                dragMode = 'moveDistributor';
                drawing = true;
                updateDistributorList();
                drawAll();
            } else if (hit.wall) {
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
                const r = hitTestZone(startX, startY);
                const d2 = hitTestDistributor(startX, startY);
                const doorHit = hitTestDoor(startX, startY);
                const p = hitTestPipe(startX, startY);
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
        drawAll();
    });

    drawPipesBtn.addEventListener('click', generatePipes);
    exportBtn.addEventListener('click', exportPlan);
    fixWallsBtn.addEventListener('click', () => { connectWalls(); drawAll(); });

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
            drawAll();
        } else if (d) {
            d.name = prompt('Name?', d.name || '') || d.name;
            const width = parseFloat(prompt('Width (m)?', (d.width/pixelsPerMeter).toFixed(2)), 10);
            const depth = parseFloat(prompt('Depth (m)?', (d.height/pixelsPerMeter).toFixed(2)), 10);
            const connections = parseInt(prompt('Connections?', d.connections), 10);
            if (!isNaN(width)) d.width = width * pixelsPerMeter;
            if (!isNaN(depth)) d.height = depth * pixelsPerMeter;
            if (!isNaN(connections)) d.connections = connections;
            drawAll();
        } else if (doorHit) {
            const newWidth = parseFloat(prompt('Door width (m)?', (doorHit.door.width / pixelsPerMeter).toFixed(2)), 10);
            if (!isNaN(newWidth)) doorHit.door.width = newWidth * pixelsPerMeter;
            drawAll();
        }
    });

    // initialise with one floor
    addFloor('Floor 1');
    setMode('select');
    resizeCanvas();
});
