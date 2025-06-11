# Underfloor Heating Planner

This project contains a small HTML5 application for planning underfloor heating layouts. It supports multiple floors, walls with angle and point snapping, draggable lines with editable lengths, rectangular distributors and zones assigned to distributors. The application can generate a simple snake-like pipe layout from each distributor to its zones.

## Usage

Open `index.html` in a modern web browser. Use the toolbar to add floors and select which floor to view. The **Draw Wall** tool creates snapping lines. Use **Select/Move** to drag whole lines or their ends and edit their length in the **Line Length** input. Zones and distributors can also be moved with this tool. Double‑click a zone or distributor to change its properties or use the **Edit Distributor** button when a distributor is selected.

The grid is scaled so that 0.5 m corresponds to roughly 1 cm on screen. Adjust the grid size input if needed. Pipe spacing is entered in millimetres. Use the **Pan** tool to move the entire floor plan inside the canvas. Click **Draw Pipes** to generate a simple pipe layout. **Clear** removes all items from the current floor.
