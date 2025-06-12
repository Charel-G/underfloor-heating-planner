# Underfloor Heating Planner

This project contains a small HTML5 application for planning underfloor heating layouts. It supports multiple floors, walls with angle and point snapping, draggable lines with editable lengths, rectangular distributors and polygonal zones assigned to distributors. The application can automatically route supply and return pipes from distributors to zones using horizontal and vertical segments that avoid walls when possible.
The routing algorithm now estimates a search radius from the distributor to the furthest wall so that pipe paths stay within the building outline.

Pipe routing checks if a direct path from a distributor to a zone edge is free of walls. When possible that straight route is used. Otherwise an A* search with a Manhattan heuristic finds the shortest axis-aligned route. The entry point is chosen by sampling points along the zone polygon and selecting the one with the shortest accessible path. After reaching this entry the pipes fill the zone in a serpentine pattern and return to the distributor.

## Usage

Open `index.html` in a modern web browser. A floor list is displayed to the left of the canvas. Use **Add Floor** to create new floors; click a floor in the list to view it or double‑click its name to rename it.
The **Draw Wall** tool creates snapping lines. Use **Draw Zone** to trace around an area using multiple segments; when you finish back at the starting point the zone is created and you can enter its parameters. Use **Select/Move** to drag whole lines or their ends and edit their length in the **Line Length** input. Zones and distributors can also be moved with this tool. Double‑click a zone or distributor to change its properties or use the **Edit Distributor** button when a distributor is selected. Use **Delete Selected** (or press the Delete key) to remove the currently selected wall, zone or distributor.

The grid is scaled so that 0.5 m corresponds to roughly 1 cm on screen. Adjust the grid size input if needed. Pipe spacing is entered in millimetres. Use the **Pan** tool to move the entire floor plan inside the canvas. Click **Draw Pipes** to automatically route supply and return pipes and fill each zone. **Clear** removes all items from the current floor.
