# Underfloor Heating Planner

This repository contains a small HTML5 application for planning underfloor
heating layouts. It supports multiple floors, snapping walls and zones,
distributor rectangles and automatic pipe routing.
Pipes are drawn from the chosen distributor to each zone using horizontal and
vertical segments that avoid walls when possible. If a direct line is blocked,
an A* search with a Manhattan heuristic finds the shortest axis‑aligned route.
After reaching the zone the pipes fill it in a serpentine pattern and then
return to the distributor along the same path.

## Features

- Multiple floors with rename and delete options
- Walls snap to angles and existing points and can be dragged or resized
- Rectangular distributors with editable size, name and pipe connections
- Zones drawn as polygons assigned to a distributor and spacing
- Automatic supply and return routing with serpentine filling

## Usage

Open `index.html` in a modern web browser. A floor list is displayed to the left of the canvas. Use **Add Floor** to create new floors; click a floor in the list to view it or double‑click its name to rename it.
The **Draw Wall** tool creates snapping lines. Use **Draw Zone** to trace around an area using multiple segments; when you finish back at the starting point the zone is created and you can enter its parameters. Use **Select/Move** to drag whole lines or their ends and edit their length in the **Line Length** input. Zones and distributors can also be moved with this tool. Double‑click a zone or distributor to change its properties or use the **Edit Distributor** button when a distributor is selected. Use **Delete Selected** (or press the Delete key) to remove the currently selected wall, zone or distributor.

The grid is scaled so that 0.5 m corresponds to roughly 1 cm on screen. Adjust the grid size input if needed. Pipe spacing is entered in millimetres. Use the **Pan** tool to move the entire floor plan inside the canvas. Click **Draw Pipes** to automatically route supply and return pipes and fill each zone. **Clear** removes all items from the current floor.

You can simply open `index.html` in your browser or run a small local server
with Python:

```bash
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000) in your browser.
