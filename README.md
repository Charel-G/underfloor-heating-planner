# Underfloor Heating Planner

This repository contains a small HTML5 application for planning underfloor
heating layouts. It supports multiple floors, snapping walls and zones,
distributor rectangles and automatic pipe routing.
Pipes are drawn from each distributor to its zones using an A* search that
explores eight directions. Diagonal steps are straightened into horizontal and
vertical segments so the pipes never run at odd angles or through walls.
After reaching the zone, a serpentine loop is drawn inside it and the return
line follows the supply path back to the distributor.

## Features

- Multiple floors with rename and delete options
- Walls snap to angles and existing points and can be dragged or resized
- Walls have adjustable thickness (default 0.25 m) and doorways can be dropped onto walls
- Rectangular distributors with editable size, name and pipe connections
- Zones drawn as polygons assigned to a distributor and spacing
- Automatic supply and return routing with serpentine filling

## Usage

Open `index.html` in a modern web browser. A floor list is displayed to the left of the canvas. Use **Add Floor** to create new floors; click a floor in the list to view it or double‑click its name to rename it.
The **Draw Wall** tool creates snapping lines. Use **Draw Zone** to trace around an area using multiple segments; when you finish back at the starting point the zone is created and you can enter its parameters. Use **Select/Move** to drag whole lines or their ends and edit their length in the **Line Length** input. Zones and distributors can also be moved with this tool. Double‑click a zone or distributor to change its properties or use the **Edit Distributor** button when a distributor is selected. Use **Delete Selected** (or press the Delete key) to remove the currently selected wall, zone or distributor.

Walls are drawn with a default thickness of 0.25 m. When a wall is selected, the **Wall Thickness** input allows you to change this value. The **Add Door** tool places a doorway onto a wall; doors snap to the wall’s centre line and can be repositioned with the select tool or resized by double‑clicking them.

The grid is scaled so that 0.5 m corresponds to roughly 1 cm on screen. Adjust the grid size input if needed. Pipe spacing is entered in millimetres. Use the **Pan** tool to move the entire floor plan inside the canvas. Click **Draw Pipes** to automatically route supply and return pipes and fill each zone. **Clear** removes all items from the current floor.

You can simply open `index.html` in your browser or run a small local server
with Python:

```bash
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000) in your browser.
