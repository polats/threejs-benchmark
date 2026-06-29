const GRID_WIDTH = 12;
const GRID_HEIGHT = 10;
const CELL_SIZE = 2;

export function getLevelBounds() {
	const minX = 0;
	const maxX = (GRID_WIDTH - 1) * CELL_SIZE;
	const minZ = 0;
	const maxZ = (GRID_HEIGHT - 1) * CELL_SIZE;
	return {
		initialized: true,
		minX,
		maxX,
		minZ,
		maxZ,
		width: maxX - minX,
		height: maxZ - minZ
	};
}
