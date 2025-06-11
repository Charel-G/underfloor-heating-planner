window.addEventListener('load', () => {
    const canvas = document.getElementById('floorPlanCanvas');
    const ctx = canvas.getContext('2d');
    const drawRoomBtn = document.getElementById('drawRoomBtn');
    const addDistributorBtn = document.getElementById('addDistributorBtn');
    const clearBtn = document.getElementById('clearBtn');
    const drawPipesBtn = document.getElementById('drawPipesBtn');
    const spacingInput = document.getElementById('pipeSpacing');
    const gridInput = document.getElementById('gridSize');

    let gridSize = parseInt(gridInput.value, 10) || 50;
    let mode = null;
    let rooms = [];
    let distributors = [];
    let startX = 0;
    let startY = 0;
    let drawing = false;

    gridInput.addEventListener('change', () => {
        gridSize = parseInt(gridInput.value, 10) || 50;
        drawAll();
    });

    function drawGrid() {
        ctx.strokeStyle = '#ccc';
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    function drawAll() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();
        ctx.strokeStyle = '#000';
        rooms.forEach(r => {
            ctx.strokeRect(r.x, r.y, r.width, r.height);
        });
        ctx.fillStyle = 'blue';
        distributors.forEach(d => {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawPipes() {
        drawAll();
        const spacing = parseInt(spacingInput.value, 10) || gridSize;
        ctx.strokeStyle = 'orange';
        rooms.forEach(room => {
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
    }

    drawRoomBtn.addEventListener('click', () => {
        mode = 'room';
    });

    addDistributorBtn.addEventListener('click', () => {
        mode = 'distributor';
    });

    clearBtn.addEventListener('click', () => {
        rooms = [];
        distributors = [];
        drawAll();
    });

    drawPipesBtn.addEventListener('click', drawPipes);

    canvas.addEventListener('mousedown', e => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (mode === 'room') {
            drawing = true;
            startX = x;
            startY = y;
        } else if (mode === 'distributor') {
            distributors.push({ x, y });
            drawAll();
        }
    });

    canvas.addEventListener('mousemove', e => {
        if (!drawing || mode !== 'room') return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        drawAll();
        ctx.strokeStyle = 'red';
        ctx.strokeRect(startX, startY, x - startX, y - startY);
    });

    canvas.addEventListener('mouseup', e => {
        if (!drawing || mode !== 'room') return;
        drawing = false;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        rooms.push({
            x: Math.min(startX, x),
            y: Math.min(startY, y),
            width: Math.abs(x - startX),
            height: Math.abs(y - startY)
        });
        drawAll();
    });

    drawAll();
});
