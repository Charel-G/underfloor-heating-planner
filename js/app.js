window.addEventListener('load', () => {
    const canvas = document.getElementById('floorPlanCanvas');
    const ctx = canvas.getContext('2d');
    const addFloorBtn = document.getElementById('addFloorBtn');
    const floorSelect = document.getElementById('floorSelect');
    const drawWallBtn = document.getElementById('drawWallBtn');
    const selectBtn = document.getElementById('selectBtn');
    const drawZoneBtn = document.getElementById('drawZoneBtn');
    const addDistributorBtn = document.getElementById('addDistributorBtn');
    const clearBtn = document.getElementById('clearBtn');
    const drawPipesBtn = document.getElementById('drawPipesBtn');
    const spacingInput = document.getElementById('pipeSpacing');
    const gridInput = document.getElementById('gridSize');
    const lengthInput = document.getElementById('lineLength');

    let gridSize = parseInt(gridInput.value, 10) || 50;
    let floors = [];
    let currentFloor = null;
    let mode = null;
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let selectedWall = null;
    let selectedZone = null;
    let selectedDistributor = null;
    let dragMode = null; // move, end1, end2 or moveZone/distributor

    function addFloor(name) {
        floors.push({
            name,
            walls: [],
            zones: [],
            distributors: []
        });
        currentFloor = floors[floors.length - 1];
        updateFloorSelect();
    }

    function updateFloorSelect() {
        floorSelect.innerHTML = '';
        floors.forEach((f, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = f.name;
            floorSelect.appendChild(opt);
        });
        if (currentFloor) {
            floorSelect.value = floors.indexOf(currentFloor);
        }
    }

    floorSelect.addEventListener('change', () => {
        currentFloor = floors[parseInt(floorSelect.value, 10)];
        selectedWall = null;
        selectedZone = null;
        selectedDistributor = null;
        drawAll();
    });

    addFloorBtn.addEventListener('click', () => {
        const name = prompt('Floor name?', `Floor ${floors.length + 1}`);
        if (name) {
            addFloor(name);
            drawAll();
        }
    });

    drawWallBtn.addEventListener('click', () => {
        mode = 'wall';
    });

    selectBtn.addEventListener('click', () => {
        mode = 'select';
        selectedWall = null;
        lengthInput.value = '';
        lengthInput.disabled = true;
        drawAll();
    });

    drawZoneBtn.addEventListener('click', () => {
        mode = 'zone';
    });

    addDistributorBtn.addEventListener('click', () => {
        mode = 'distributor';
    });

    clearBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        currentFloor.walls = [];
        currentFloor.zones = [];
        currentFloor.distributors = [];
        selectedWall = null;
        selectedZone = null;
        selectedDistributor = null;
        drawAll();
    });

    gridInput.addEventListener('change', () => {
        gridSize = parseInt(gridInput.value, 10) || 50;
        drawAll();
    });

    lengthInput.addEventListener('change', () => {
        if (!selectedWall) return;
        const len = parseFloat(lengthInput.value);
        if (isNaN(len)) return;
        const dx = selectedWall.x2 - selectedWall.x1;
        const dy = selectedWall.y2 - selectedWall.y1;
        const current = Math.hypot(dx, dy) || 1;
        const factor = len / current;
        selectedWall.x2 = selectedWall.x1 + dx * factor;
        selectedWall.y2 = selectedWall.y1 + dy * factor;
        drawAll();
    });

    function drawGrid() {
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }

    function drawAll() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        if (!currentFloor) return;
        ctx.strokeStyle = '#000';
        // walls
        currentFloor.walls.forEach(w => {
            ctx.strokeStyle = (w === selectedWall) ? 'red' : '#000';
            ctx.beginPath();
            ctx.moveTo(w.x1, w.y1);
            ctx.lineTo(w.x2, w.y2);
            ctx.stroke();
        });
        ctx.strokeStyle = '#000';
        // zones
        ctx.fillStyle = 'rgba(0,255,0,0.1)';
        currentFloor.zones.forEach(r => {
            ctx.fillStyle = r === selectedZone ? 'rgba(0,255,0,0.3)' : 'rgba(0,255,0,0.1)';
            ctx.fillRect(r.x, r.y, r.width, r.height);
            ctx.strokeStyle = r === selectedZone ? 'red' : '#000';
            ctx.strokeRect(r.x, r.y, r.width, r.height);
            if (r.name) {
                ctx.fillStyle = '#000';
                ctx.fillText(r.name, r.x + 4, r.y + 12);
            }
        });
        // distributors
        ctx.fillStyle = 'rgba(0,0,255,0.3)';
        currentFloor.distributors.forEach(d => {
            ctx.fillStyle = d === selectedDistributor ? 'rgba(0,0,255,0.5)' : 'rgba(0,0,255,0.3)';
            ctx.fillRect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
            ctx.strokeStyle = d === selectedDistributor ? 'red' : '#000';
            ctx.strokeRect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
            if (d.name) {
                ctx.fillStyle = '#000';
                ctx.fillText(d.name, d.x - d.width / 2 + 2, d.y - d.height / 2 + 12);
            }
        });
    }

    function drawPipes() {
        drawAll();
        if (!currentFloor) return;
        ctx.strokeStyle = 'orange';
        currentFloor.zones.forEach(room => {
            const spacing = room.spacing || parseInt(spacingInput.value, 10) || gridSize;
            let leftToRight = true;
            for (let y = room.y + spacing / 2; y < room.y + room.height; y += spacing) {
                ctx.beginPath();
                if (leftToRight) {
                    ctx.moveTo(room.x, y);
                    ctx.lineTo(room.x + room.width, y);
                } else {
                    ctx.moveTo(room.x + room.width, y);
                    ctx.lineTo(room.x, y);
                }
                ctx.stroke();
                leftToRight = !leftToRight;
            }
        });
        // connection lines from distributors to zones
        ctx.strokeStyle = 'blue';
        currentFloor.zones.forEach(room => {
            const d = currentFloor.distributors[room.distributorId || 0];
            if (!d) return;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(room.x + room.width / 2, room.y + room.height / 2);
            ctx.stroke();
        });
    }

    const SNAP_DIST = 10;

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
        currentFloor.walls.forEach(w => {
            const points = [
                {x: w.x1, y: w.y1},
                {x: w.x2, y: w.y2},
                {x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2}
            ];
            points.forEach(p => {
                if (Math.hypot(p.x - x, p.y - y) < SNAP_DIST) {
                    sx = p.x;
                    sy = p.y;
                }
            });
        });
        return {x: sx, y: sy};
    }

    function wallLength(w) {
        return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
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
                return {wall: w, mode: 'move'};
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

    function hitTestZone(x, y) {
        for (let i = currentFloor.zones.length - 1; i >= 0; i--) {
            const r = currentFloor.zones[i];
            if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
                return r;
            }
        }
        return null;
    }

    function hitTestDistributor(x, y) {
        for (let i = currentFloor.distributors.length - 1; i >= 0; i--) {
            const d = currentFloor.distributors[i];
            if (x >= d.x - d.width / 2 && x <= d.x + d.width / 2 &&
                y >= d.y - d.height / 2 && y <= d.y + d.height / 2) {
                return d;
            }
        }
        return null;
    }

    canvas.addEventListener('mousedown', e => {
        if (!currentFloor) return;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        if (mode === 'wall' || mode === 'zone') {
            drawing = true;
        } else if (mode === 'distributor') {
            const width = parseInt(prompt('Width (m)?', '30'), 10) || 30;
            const height = parseInt(prompt('Height (m)?', '10'), 10) || 10;
            const name = prompt('Name?', `D${currentFloor.distributors.length + 1}`) || '';
            const connections = parseInt(prompt('Connections?', '2'), 10) || 2;
            currentFloor.distributors.push({ x: startX, y: startY, width, height, name, connections });
            drawAll();
        } else if (mode === 'select') {
            const hit = hitTestWall(startX, startY);
            if (hit.wall) {
                selectedWall = hit.wall;
                selectedZone = null;
                selectedDistributor = null;
                dragMode = hit.mode;
                drawing = true;
                lengthInput.disabled = false;
                lengthInput.value = wallLength(selectedWall).toFixed(0);
            } else {
                selectedWall = null;
                lengthInput.value = '';
                lengthInput.disabled = true;
                const r = hitTestZone(startX, startY);
                const d = hitTestDistributor(startX, startY);
                if (r) {
                    selectedZone = r;
                    selectedDistributor = null;
                    dragMode = 'moveZone';
                    drawing = true;
                } else if (d) {
                    selectedDistributor = d;
                    selectedZone = null;
                    dragMode = 'moveDistributor';
                    drawing = true;
                } else {
                    selectedZone = null;
                    selectedDistributor = null;
                    drawAll();
                }
            }
        }
    });

    canvas.addEventListener('mousemove', e => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        drawAll();
        if (mode === 'wall') {
            const snap = snapAngle(x - startX, y - startY);
            const snapped = snapToPoints(startX + snap.dx, startY + snap.dy);
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(snapped.x, snapped.y);
            ctx.stroke();
        } else if (mode === 'zone') {
            ctx.strokeStyle = 'red';
            const snap = snapToPoints(x, y);
            ctx.strokeRect(startX, startY, snap.x - startX, snap.y - startY);
        } else if (mode === 'select' && selectedWall) {
            if (dragMode === 'move') {
                const dx = x - startX;
                const dy = y - startY;
                selectedWall.x1 += dx;
                selectedWall.y1 += dy;
                selectedWall.x2 += dx;
                selectedWall.y2 += dy;
                startX = x;
                startY = y;
                lengthInput.value = wallLength(selectedWall).toFixed(0);
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
                lengthInput.value = wallLength(selectedWall).toFixed(0);
                drawAll();
            }
        } else if (mode === 'select' && selectedZone && dragMode === 'moveZone') {
            const dx = x - startX;
            const dy = y - startY;
            selectedZone.x += dx;
            selectedZone.y += dy;
            startX = x;
            startY = y;
            drawAll();
        } else if (mode === 'select' && selectedDistributor && dragMode === 'moveDistributor') {
            const dx = x - startX;
            const dy = y - startY;
            selectedDistributor.x += dx;
            selectedDistributor.y += dy;
            startX = x;
            startY = y;
            drawAll();
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (!drawing) return;
        drawing = false;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (mode === 'wall') {
            const snap = snapAngle(x - startX, y - startY);
            const snapped = snapToPoints(startX + snap.dx, startY + snap.dy);
            currentFloor.walls.push({
                x1: startX,
                y1: startY,
                x2: snapped.x,
                y2: snapped.y
            });
        } else if (mode === 'zone') {
            const snap = snapToPoints(x, y);
            const name = prompt('Zone name?', `Zone ${currentFloor.zones.length + 1}`) || '';
            const spacing = parseInt(prompt('Pipe spacing?', spacingInput.value), 10) || parseInt(spacingInput.value, 10) || gridSize;
            let distributorId = null;
            if (currentFloor.distributors.length > 0) {
                const list = currentFloor.distributors.map((d,i) => `${i}: ${d.name}`).join('\n');
                const ans = prompt('Distributor index:\n' + list, '0');
                const idx = parseInt(ans, 10);
                if (!isNaN(idx) && currentFloor.distributors[idx]) distributorId = idx;
            }
            currentFloor.zones.push({
                x: Math.min(startX, snap.x),
                y: Math.min(startY, snap.y),
                width: Math.abs(snap.x - startX),
                height: Math.abs(snap.y - startY),
                name,
                spacing,
                distributorId
            });
        } else if (mode === 'select') {
            lengthInput.value = selectedWall ? wallLength(selectedWall).toFixed(0) : '';
        }
        dragMode = null;
        drawAll();
    });

    drawPipesBtn.addEventListener('click', drawPipes);

    canvas.addEventListener('dblclick', e => {
        if (!currentFloor) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const r = hitTestZone(x, y);
        const d = hitTestDistributor(x, y);
        if (r) {
            r.name = prompt('Zone name?', r.name || '') || r.name;
            const spacing = parseInt(prompt('Pipe spacing?', r.spacing), 10);
            if (!isNaN(spacing)) r.spacing = spacing;
            if (currentFloor.distributors.length > 0) {
                const list = currentFloor.distributors.map((d,i)=>`${i}: ${d.name}`).join('\n');
                const ans = prompt('Distributor index:\n' + list, r.distributorId ?? '');
                const idx = parseInt(ans, 10);
                if (!isNaN(idx) && currentFloor.distributors[idx]) r.distributorId = idx;
            }
            drawAll();
        } else if (d) {
            d.name = prompt('Name?', d.name || '') || d.name;
            const width = parseInt(prompt('Width?', d.width), 10);
            const height = parseInt(prompt('Height?', d.height), 10);
            const connections = parseInt(prompt('Connections?', d.connections), 10);
            if (!isNaN(width)) d.width = width;
            if (!isNaN(height)) d.height = height;
            if (!isNaN(connections)) d.connections = connections;
            drawAll();
        }
    });

    // initialise with one floor
    addFloor('Floor 1');
    drawAll();
});
