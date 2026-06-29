import { GLYPHS } from './Mojibake.js';
import { applyTileDepthFade } from './TileDepthFade.js';

export const comboModelCache = {};
export const activeComboMeshes = [];

export function updatePatternStats({ document, useComboTiles, wfc }) {
	const statsElement = document.getElementById('patternStats');
	if (!statsElement) return;

	if (!useComboTiles) {
		statsElement.textContent = 'disabled';
		return;
	}

	if (!wfc.isDone) {
		statsElement.textContent = 'generating...';
		return;
	}

	statsElement.textContent = `${activeComboMeshes.length} patterns`;
}

export function hideComboMeshes() {
	activeComboMeshes.forEach(({ mesh }) => {
		mesh.visible = false;
	});
}

export function showComboMeshes() {
	activeComboMeshes.forEach(({ mesh }) => {
		mesh.visible = true;
	});
}

export function applyComboPatterns(context) {
	if (!context.useComboTiles) return;

	clearComboMeshes(context);

	const allPatterns = detectAllPatterns(context);
	allPatterns.sort((a, b) => b.size - a.size);

	const usedCells = new Set();
	for (const pattern of allPatterns) {
		if (!hasOverlap(pattern, usedCells, context.gridWidth)) {
			applyComboMesh(pattern, context);
			markCellsUsed(pattern, usedCells, context.gridWidth);
		}
	}

	context.updatePatternStats();
}

export function clearComboMeshes(context) {
	activeComboMeshes.forEach(({ mesh, pattern }) => {
		context.scene.remove(mesh);
		showOriginalTiles(pattern, context);
		context.showInstancesForPattern(pattern);
	});
	activeComboMeshes.length = 0;
	context.comboBillboardMeshes.length = 0;
	context.invalidateBillboardRotations();
	context.updatePatternStats();
}

export function iteratePatternCells(pattern, callback) {
	const { x, y, width, height, length, direction } = pattern;
	const type = getPatternType(pattern);

	if (type === 'linear' || type === 'sequential') {
		const patternLength = length || 1;
		const patternDirection = direction || 'horizontal';
		for (let i = 0; i < patternLength; i++) {
			const cx = patternDirection === 'horizontal' ? x + i : x;
			const cy = patternDirection === 'horizontal' ? y : y + i;
			if (callback(cx, cy) === false) return false;
		}
	} else if (type === 'rectangular') {
		for (let dy = 0; dy < height; dy++) {
			for (let dx = 0; dx < width; dx++) {
				if (callback(x + dx, y + dy) === false) return false;
			}
		}
	}
	return true;
}

export function logComboTilesInfo(context) {
	console.log('=== COMBO TILES DEBUG INFO ===');
	console.log(`Total active combo meshes: ${activeComboMeshes.length}`);

	if (activeComboMeshes.length === 0) {
		console.log('No combo tiles currently placed.');
		return;
	}

	activeComboMeshes.forEach((combo, index) => {
		const { mesh, pattern } = combo;
		const { x, y, tileName, patternType, direction, length, width, height } = pattern;

		console.log(`\n--- Combo #${index + 1}: ${tileName}_${patternType} ---`);
		console.log(`  Grid position: (${x}, ${y})`);
		console.log(`  World position: (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
		console.log(`  Rotation Y: ${(mesh.rotation.y * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}`);

		if (direction) {
			console.log(`  Direction: ${direction}`);
			console.log(`  Length: ${length}`);
		} else if (width && height) {
			console.log(`  Size: ${width}x${height}`);
		}

		console.log('  Constituent tiles:');
		iteratePatternCells(pattern, (cx, cy) => {
			const cell = context.wfc.grid[getCellIndex(cx, cy, context.gridWidth)];
			if (cell && cell.tile) {
				const tile = cell.tile;
				console.log(`    [${cx}, ${cy}]: ${tile.name} rot=${tile.rotation} edges=[${tile.edges.join(', ')}]`);
			}
		});

		console.log('  Neighboring tiles:');
		const neighbors = getComboNeighbors(pattern, context);
		neighbors.forEach(neighbor => {
			console.log(`    ${neighbor.side}: [${neighbor.x}, ${neighbor.y}] ${neighbor.tileName} rot=${neighbor.rotation} edges=[${neighbor.edges.join(', ')}]`);
		});
	});

	console.log('\n=== END COMBO TILES DEBUG ===');
}

function getComboVariants(baseKey) {
	const variants = comboModelCache[baseKey];
	if (!variants || variants.length === 0) return [];

	return variants.map(entry => {
		if (entry && entry.model) return entry;
		return { key: baseKey, model: entry, constraints: null };
	});
}

function getRotatedEdgeIndex(baseIndex, rotation) {
	const normalizedRotation = ((rotation % 4) + 4) % 4;
	return (baseIndex + normalizedRotation) % 4;
}

function mapPatternCellToConstraints(localX, localY, width, height, rotation) {
	const normalizedRotation = ((rotation % 4) + 4) % 4;
	if (normalizedRotation === 0) return { x: localX, y: localY };
	if (normalizedRotation === 1) return { x: localY, y: height - 1 - localX };
	if (normalizedRotation === 2) return { x: width - 1 - localX, y: height - 1 - localY };
	return { x: width - 1 - localY, y: localX };
}

function checkEdgeConstraints(grid, startX, startY, length, direction, constraints, width, height, gridWidth) {
	const isHorizontal = (direction === 'horizontal');
	const baseWidth = width || (isHorizontal ? length : 1);
	const baseHeight = height || (isHorizontal ? 1 : length);

	for (let i = 0; i < length; i++) {
		const x = isHorizontal ? startX + i : startX;
		const y = isHorizontal ? startY : startY + i;
		const cell = grid[y * gridWidth + x];
		if (!cell || !cell.tile) return false;

		const localX = isHorizontal ? i : 0;
		const localY = isHorizontal ? 0 : i;
		const rotation = cell.tile.rotation || 0;
		const mapped = mapPatternCellToConstraints(localX, localY, baseWidth, baseHeight, rotation);

		if (mapped.x < 0 || mapped.x >= baseWidth || mapped.y < 0 || mapped.y >= baseHeight) {
			return false;
		}

		const constraintIndex = mapped.y * baseWidth + mapped.x;
		const cellConstraint = constraints[constraintIndex];
		if (!cellConstraint) continue;

		const directionMap = { N: 0, E: 1, S: 2, W: 3 };
		for (const [constraintDirection, expectedType] of Object.entries(cellConstraint)) {
			if (expectedType === null) continue;
			const baseIndex = directionMap[constraintDirection];
			const rotatedIndex = getRotatedEdgeIndex(baseIndex, rotation);
			const actualType = cell.tile.edges[rotatedIndex];
			if (actualType !== expectedType) {
				return false;
			}
		}
	}
	return true;
}

function detectAllPatterns(context) {
	const allPatterns = [];
	const availablePatterns = Object.keys(comboModelCache);

	availablePatterns.forEach(patternKey => {
		const [tileName, patternType] = patternKey.split('_');

		if (patternType.includes('x')) {
			const parts = patternType.split('x');
			const firstNum = parseInt(parts[0]);
			const secondNum = parts[1] ? parseInt(parts[1]) : null;

			if (secondNum !== null && !isNaN(secondNum)) {
				const patterns = detectNxMPatterns(context.wfc.grid, tileName, firstNum, secondNum, context.gridWidth, context.gridHeight);
				patterns.forEach(pattern => {
					pattern.patternType = patternType;
					pattern.size = firstNum * secondNum;
				});
				allPatterns.push(...patterns);
			} else {
				const patterns = detectLinearPatterns(context, tileName, firstNum, patternType);
				allPatterns.push(...patterns);
			}
		} else if (patternType.startsWith('seq')) {
			const length = parseInt(patternType.substring(3));
			const patterns = detectSequencePatterns(context.wfc.grid, tileName, length, context.gridWidth, context.gridHeight);
			patterns.forEach(pattern => {
				pattern.patternType = patternType;
				pattern.size = length;
			});
			allPatterns.push(...patterns);
		}
	});

	return allPatterns;
}

function detectNxMPatterns(grid, tileName, width, height, gridWidth, gridHeight) {
	const matches = [];
	for (let y = 0; y <= gridHeight - height; y++) {
		for (let x = 0; x <= gridWidth - width; x++) {
			if (checkNxMMatch(grid, tileName, x, y, width, height, gridWidth)) {
				matches.push({ x, y, width, height, tileName });
			}
		}
	}
	return matches;
}

function checkNxMMatch(grid, tileName, startX, startY, width, height, gridWidth) {
	const grassEdge = 'GRASS';
	const isLinear = (width === 1 || height === 1);

	for (let dy = 0; dy < height; dy++) {
		for (let dx = 0; dx < width; dx++) {
			const cell = grid[(startY + dy) * gridWidth + (startX + dx)];
			if (!cell.collapsed || !cell.tile || cell.tile.name !== tileName) {
				return false;
			}
		}
	}

	if (!isLinear) return true;

	const isHorizontalPattern = (width > 1 && height === 1);
	const isVerticalPattern = (width === 1 && height > 1);

	for (let dy = 0; dy < height; dy++) {
		for (let dx = 0; dx < width; dx++) {
			const cell = grid[(startY + dy) * gridWidth + (startX + dx)];
			const tile = cell.tile;
			const rotation = tile.rotation;
			const isEWOriented = (rotation === 0 || rotation === 2);
			const isNSOriented = (rotation === 1 || rotation === 3);

			if (isHorizontalPattern && !isEWOriented) return false;
			if (isVerticalPattern && !isNSOriented) return false;

			if (dx < width - 1) {
				const rightCell = grid[(startY + dy) * gridWidth + (startX + dx + 1)];
				const eastEdge = tile.edges[1];
				const westEdge = rightCell.tile.edges[3];
				if (eastEdge !== westEdge || eastEdge === grassEdge) return false;
			}

			if (dy < height - 1) {
				const belowCell = grid[(startY + dy + 1) * gridWidth + (startX + dx)];
				const southEdge = tile.edges[2];
				const northEdge = belowCell.tile.edges[0];
				if (southEdge !== northEdge || southEdge === grassEdge) return false;
			}
		}
	}

	return true;
}

function detectLinearPatterns(context, tileName, length, patternType) {
	const matches = [];
	const baseKey = `${tileName}_${patternType}`;
	const variants = getComboVariants(baseKey);
	if (variants.length === 0) return matches;

	for (let y = 0; y < context.gridHeight; y++) {
		for (let x = 0; x <= context.gridWidth - length; x++) {
			if (checkLinearMatch(context.wfc.grid, tileName, x, y, length, 'horizontal', context.gridWidth)) {
				const matchingVariants = variants.filter(variant =>
					!variant.constraints || checkEdgeConstraints(
						context.wfc.grid,
						x,
						y,
						length,
						'horizontal',
						variant.constraints,
						variant.width,
						variant.height,
						context.gridWidth
					)
				);
				if (matchingVariants.length === 0) continue;
				const matchingVariant = matchingVariants[Math.floor(context.originalRandom() * matchingVariants.length)];
				matches.push({
					x, y,
					length,
					direction: 'horizontal',
					tileName,
					patternType,
					size: length,
					variantKey: matchingVariant.key
				});
			}
		}
	}

	for (let y = 0; y <= context.gridHeight - length; y++) {
		for (let x = 0; x < context.gridWidth; x++) {
			if (checkLinearMatch(context.wfc.grid, tileName, x, y, length, 'vertical', context.gridWidth)) {
				const matchingVariants = variants.filter(variant =>
					!variant.constraints || checkEdgeConstraints(
						context.wfc.grid,
						x,
						y,
						length,
						'vertical',
						variant.constraints,
						variant.width,
						variant.height,
						context.gridWidth
					)
				);
				if (matchingVariants.length === 0) continue;
				const matchingVariant = matchingVariants[Math.floor(context.originalRandom() * matchingVariants.length)];
				matches.push({
					x, y,
					length,
					direction: 'vertical',
					tileName,
					patternType,
					size: length,
					variantKey: matchingVariant.key
				});
			}
		}
	}

	return matches;
}

function checkLinearMatch(grid, tileName, startX, startY, length, direction, gridWidth) {
	const grassEdge = 'GRASS';
	const isHorizontal = (direction === 'horizontal');

	for (let i = 0; i < length; i++) {
		const x = isHorizontal ? startX + i : startX;
		const y = isHorizontal ? startY : startY + i;
		const cell = grid[y * gridWidth + x];
		if (!cell.collapsed || !cell.tile || cell.tile.name !== tileName) return false;

		const rotation = cell.tile.rotation;
		const isEWOriented = (rotation === 0 || rotation === 2);
		const isNSOriented = (rotation === 1 || rotation === 3);

		if (isHorizontal && !isEWOriented) return false;
		if (!isHorizontal && !isNSOriented) return false;
	}

	for (let i = 0; i < length - 1; i++) {
		const x1 = isHorizontal ? startX + i : startX;
		const y1 = isHorizontal ? startY : startY + i;
		const x2 = isHorizontal ? startX + i + 1 : startX;
		const y2 = isHorizontal ? startY : startY + i + 1;
		const tile1 = grid[y1 * gridWidth + x1].tile;
		const tile2 = grid[y2 * gridWidth + x2].tile;

		if (isHorizontal) {
			const eastEdge = tile1.edges[1];
			const westEdge = tile2.edges[3];
			if (eastEdge !== westEdge || eastEdge === grassEdge) return false;
		} else {
			const southEdge = tile1.edges[2];
			const northEdge = tile2.edges[0];
			if (southEdge !== northEdge || southEdge === grassEdge) return false;
		}
	}

	return true;
}

function detectSequencePatterns(grid, tileName, length, gridWidth, gridHeight) {
	const matches = [];

	for (let y = 0; y < gridHeight; y++) {
		for (let x = 0; x <= gridWidth - length; x++) {
			if (checkSequenceMatch(grid, tileName, x, y, length, 'horizontal', gridWidth)) {
				matches.push({ x, y, length, direction: 'horizontal', tileName });
			}
		}
	}

	for (let y = 0; y <= gridHeight - length; y++) {
		for (let x = 0; x < gridWidth; x++) {
			if (checkSequenceMatch(grid, tileName, x, y, length, 'vertical', gridWidth)) {
				matches.push({ x, y, length, direction: 'vertical', tileName });
			}
		}
	}

	return matches;
}

function checkSequenceMatch(grid, tileName, startX, startY, length, direction, gridWidth) {
	for (let i = 0; i < length; i++) {
		let x = startX;
		let y = startY;
		if (direction === 'horizontal') {
			x += i;
		} else {
			y += i;
		}

		const cell = grid[y * gridWidth + x];
		if (!cell.collapsed || !cell.tile || cell.tile.name !== tileName) return false;

		const rotation = cell.tile.rotation;
		const isEWOriented = (rotation === 0 || rotation === 2);
		const isNSOriented = (rotation === 1 || rotation === 3);

		if (direction === 'horizontal' && !isEWOriented) return false;
		if (direction === 'vertical' && !isNSOriented) return false;
	}

	return true;
}

function hasOverlap(pattern, usedCells, gridWidth) {
	let overlap = false;
	iteratePatternCells(pattern, (cx, cy) => {
		const cellIndex = getCellIndex(cx, cy, gridWidth);
		if (usedCells.has(cellIndex)) {
			overlap = true;
			return false;
		}
	});
	return overlap;
}

function markCellsUsed(pattern, usedCells, gridWidth) {
	iteratePatternCells(pattern, (cx, cy) => {
		usedCells.add(getCellIndex(cx, cy, gridWidth));
	});
}

function getPatternType(pattern) {
	if ('direction' in pattern) return 'linear';
	if ('width' in pattern && 'height' in pattern) return 'rectangular';
	if ('length' in pattern) return 'sequential';
	return 'unknown';
}

function getPatternBounds(pattern) {
	const { x, y, direction, length = 1, width = 1, height = 1 } = pattern;
	let minX = x;
	let maxX = x;
	let minY = y;
	let maxY = y;
	if (direction === 'horizontal') {
		maxX = x + length - 1;
	} else if (direction === 'vertical') {
		maxY = y + length - 1;
	} else {
		maxX = x + width - 1;
		maxY = y + height - 1;
	}
	return { minX, maxX, minY, maxY };
}

function getCellIndex(x, y, gridWidth) {
	return y * gridWidth + x;
}

function getPatternCenter(pattern) {
	const { x, y, width, height, length, direction } = pattern;
	const type = getPatternType(pattern);

	if (type === 'linear' || type === 'sequential') {
		const patternDirection = direction || 'horizontal';
		if (patternDirection === 'horizontal') {
			return { centerX: x + (length - 1) / 2, centerZ: y };
		}
		return { centerX: x, centerZ: y + (length - 1) / 2 };
	} else if (type === 'rectangular') {
		return { centerX: x + (width - 1) / 2, centerZ: y + (height - 1) / 2 };
	}
	return { centerX: x, centerZ: y };
}

function applyComboMesh(pattern, context) {
	const { x, y, tileName, patternType } = pattern;
	const cacheKey = `${tileName}_${patternType}`;
	const variants = getComboVariants(cacheKey);
	if (!variants || variants.length === 0) return;

	let selectedVariant = null;
	if (pattern.variantKey) {
		selectedVariant = variants.find(variant => variant.key === pattern.variantKey) || null;
	}
	if (!selectedVariant) {
		selectedVariant = variants[Math.floor(context.originalRandom() * variants.length)];
	}

	const model = selectedVariant.model.clone();
	model.traverse((child) => {
		if (child.isMesh) {
			const materialResult = context.applyLandscapeMaterial(child, {
				trackBillboard: (mesh) => {
					context.comboBillboardMeshes.push(mesh);
				},
				force: false
			});

			child.material = materialResult.material;
			child.castShadow = materialResult.castShadow;
			child.receiveShadow = materialResult.receiveShadow;

			if (materialResult.materialType === 'default') {
				applyTileDepthFade(child.material);
			}

			if (materialResult.needsGradient) {
				context.applyMaterialShaderChain(child.material, materialResult.gradientPreset);
			}
			if (context.isWindSwayObjectName(child.name)) {
				context.applyWindSway(child.material, { isBush: context.isWindSwayBushName(child.name) });
			}
		}
	});

	const { centerX, centerZ } = getPatternCenter(pattern);
	model.position.set(centerX * context.cellSize, 0, centerZ * context.cellSize);

	const firstCell = context.wfc.grid[getCellIndex(x, y, context.gridWidth)];
	const tileRotation = firstCell && firstCell.tile ? firstCell.tile.rotation : 0;
	model.rotation.y = -tileRotation * Math.PI / 2;

	hideOriginalTiles(pattern, context);
	context.hideInstancesForPattern(pattern);

	context.scene.add(model);
	activeComboMeshes.push({ mesh: model, pattern });
	context.invalidateBillboardRotations();
}

function hideOriginalTiles(pattern, context) {
	iteratePatternCells(pattern, (cx, cy) => {
		const cellIndex = getCellIndex(cx, cy, context.gridWidth);
		const meshData = context.cellMeshes[cellIndex];
		if (meshData.content) {
			meshData.content.visible = false;
		}
	});
}

function showOriginalTiles(pattern, context) {
	iteratePatternCells(pattern, (cx, cy) => {
		const cellIndex = getCellIndex(cx, cy, context.gridWidth);
		const meshData = context.cellMeshes[cellIndex];
		if (meshData && meshData.content) {
			meshData.content.visible = true;
		}
	});
}

function getComboNeighbors(pattern, context) {
	const neighbors = [];
	const { minX, maxX, minY, maxY } = getPatternBounds(pattern);

	if (minY > 0) {
		for (let nx = minX; nx <= maxX; nx++) {
			const cell = context.wfc.grid[(minY - 1) * context.gridWidth + nx];
			if (cell && cell.tile) {
				neighbors.push({
					side: 'N',
					x: nx,
					y: minY - 1,
					tileName: cell.tile.name,
					rotation: cell.tile.rotation,
					edges: cell.tile.edges
				});
			}
		}
	}

	if (maxY < context.gridHeight - 1) {
		for (let nx = minX; nx <= maxX; nx++) {
			const cell = context.wfc.grid[(maxY + 1) * context.gridWidth + nx];
			if (cell && cell.tile) {
				neighbors.push({
					side: 'S',
					x: nx,
					y: maxY + 1,
					tileName: cell.tile.name,
					rotation: cell.tile.rotation,
					edges: cell.tile.edges
				});
			}
		}
	}

	if (minX > 0) {
		for (let ny = minY; ny <= maxY; ny++) {
			const cell = context.wfc.grid[ny * context.gridWidth + (minX - 1)];
			if (cell && cell.tile) {
				neighbors.push({
					side: 'W',
					x: minX - 1,
					y: ny,
					tileName: cell.tile.name,
					rotation: cell.tile.rotation,
					edges: cell.tile.edges
				});
			}
		}
	}

	if (maxX < context.gridWidth - 1) {
		for (let ny = minY; ny <= maxY; ny++) {
			const cell = context.wfc.grid[ny * context.gridWidth + (maxX + 1)];
			if (cell && cell.tile) {
				neighbors.push({
					side: 'E',
					x: maxX + 1,
					y: ny,
					tileName: cell.tile.name,
					rotation: cell.tile.rotation,
					edges: cell.tile.edges
				});
			}
		}
	}

	return neighbors;
}
