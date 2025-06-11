window.addEventListener('load', () => {
    const canvas = document.getElementById('floorPlanCanvas');
    const ctx = canvas.getContext('2d');
    const addFloorBtn = document.getElementById('addFloorBtn');
    const floorSelect = document.getElementById('floorSelect');
    const drawWallBtn = document.getElementById('drawWallBtn');
    const drawRoomBtn = document.getElementById('drawRoomBtn');
    const addDistributorBtn = document.getElementById('addDistributorBtn');
    const clearBtn = document.getElementById('clearBtn');
    const drawPipesBtn = document.getElementById('drawPipesBtn');
    const spacingInput = document.getElementById('pipeSpacing');
    const gridInput = document.getElementById('gridSize');

    let gridSize = parseInt(gridInput.value, 10) || 50;
    let floors = [];
    let currentFloor = null;
    let mode = null;
    let drawing = false;
    let startX = 0;
    let startY = 0;

    function addFloor(name) {
        floors.push({
            name,
            walls: [],
            rooms: [],
            distributors: [],
            zones: []
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

    drawRoomBtn.addEventListener('click', () => {
        mode = 'room';
    });

    addDistributorBtn.addEventListener('click', () => {
        mode = 'distributor';
    });

    clearBtn.addEventListener('click', () => {
        if (!currentFloor) return;
        currentFloor.walls = [];
        currentFloor.rooms = [];
        currentFloor.distributors = [];
        currentFloor.zones = [];
        drawAll();
    });

    gridInput.addEventListener('change', () => {
        gridSize = parseInt(gridInput.value, 10) || 50;
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
            ctx.beginPath();
            ctx.moveTo(w.x1, w.y1);
            ctx.lineTo(w.x2, w.y2);
            ctx.stroke();
        });
        // zones
        currentFloor.rooms.forEach(r => {
            ctx.strokeRect(r.x, r.y, r.width, r.height);
        });
        // distributors
        ctx.fillStyle = 'rgba(0,0,255,0.3)';
        currentFloor.distributors.forEach(d => {
            ctx.fillRect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
            ctx.strokeRect(d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);
        });
    }

    function drawPipes() {
        drawAll();
        if (!currentFloor) return;
        const spacing = parseInt(spacingInput.value, 10) || gridSize;
        ctx.strokeStyle = 'orange';
        currentFloor.rooms.forEach(room => {
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
        currentFloor.rooms.forEach(room => {
            const d = currentFloor.distributors[0];
            if (!d) return;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(room.x + room.width / 2, room.y + room.height / 2);
            ctx.stroke();
        });
    }

    function snapAngle(dx, dy) {
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.sqrt(dx * dx + dy * dy);
        return {
            dx: Math.cos(snap) * len,
            dy: Math.sin(snap) * len
        };
    }

    canvas.addEventListener('mousedown', e => {
        if (!currentFloor) return;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        if (mode === 'wall' || mode === 'room') {
            drawing = true;
        } else if (mode === 'distributor') {
            const width = parseInt(prompt('Width (m)?', '30'), 10) || 30;
            const height = parseInt(prompt('Height (m)?', '10'), 10) || 10;
            const name = prompt('Name?', `D${currentFloor.distributors.length + 1}`) || '';
            const connections = parseInt(prompt('Connections?', '2'), 10) || 2;
            currentFloor.distributors.push({ x: startX, y: startY, width, height, name, connections });
            drawAll();
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
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + snap.dx, startY + snap.dy);
            ctx.stroke();
        } else if (mode === 'room') {
            ctx.strokeStyle = 'red';
            ctx.strokeRect(startX, startY, x - startX, y - startY);
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
            currentFloor.walls.push({
                x1: startX,
                y1: startY,
                x2: startX + snap.dx,
                y2: startY + snap.dy
            });
        } else if (mode === 'room') {
            const name = prompt('Zone name?', `Zone ${currentFloor.rooms.length + 1}`) || '';
            currentFloor.rooms.push({
                x: Math.min(startX, x),
                y: Math.min(startY, y),
                width: Math.abs(x - startX),
                height: Math.abs(y - startY),
                name
            });
        }
        drawAll();
    });

    drawPipesBtn.addEventListener('click', drawPipes);

    // initialise with one floor
    addFloor('Floor 1');
    drawAll();
});
