# fusion-plugin-dependency-graph

Plugin-provided top-level **Graph** dashboard view for Fusion.

## Rendering approach

- **Filtering**: includes `triage`, `todo`, `in-progress`, `in-review`; excludes `done`, `archived`
- **Graph build**: edges are resolved only from `task.dependencies` as `source=dependent`, `target=dependency`
- **Auto-layout**: Sugiyama-style layered layout (`computeAutoLayout`) groups nodes by dependency depth and spaces layers consistently
- **Edge drawing**: SVG bezier curves from source bottom-center to target top-center, with arrowheads showing dependent → dependency direction
- **Interaction**: pan, wheel zoom, pinch zoom, zoom-in/out controls, reset, and fit-to-screen
- **Fit-to-screen**: computes node bounding box with layout node dimensions and applies zoom/pan so the graph fits in viewport with padding
- **Node rendering**: each graph node renders the real dashboard `TaskCard` via `GraphTaskNode` (no duplicated card markup)
- **In-progress behavior**: steps are visible by default and active-task glow (`agent-active`) is preserved because node cards reuse TaskCard directly
- **Graph node classes**: `.graph-task-node`, `.graph-task-node--highlighted`, and `.graph-task-node--dimmed` are available for graph-specific layering/highlight states while card internals remain owned by `TaskCard.css`
- **Drag behavior**: graph nodes pass `disableDrag={true}` to `TaskCard` so card-level HTML5 drag does not conflict with canvas pan/zoom

## Controls

- **Fit to screen** (`Maximize`)
- **Zoom in** (`ZoomIn`)
- **Zoom out** (`ZoomOut`)

All controls are rendered as floating `.btn-icon` actions in the bottom-right corner, with mobile-friendly sizing in the `@media (max-width: 768px)` override.
