import { R, C, F, RV, TILE_DEFS, ALL_TILES } from './TileDefs.js';
import { generateBridgeLocation, generateRiver, generateForestBlobs } from './TerrainPreseed.js';

// Generate roads connecting city clusters
function generateRoads(clusters, riverCells, width, height) {
	if (clusters.length < 2) return [];

	const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
	const citySet = new Set(clusters.flat().map(c => `${c.x},${c.y}`));
	const roads = [];

	// Connect each cluster to the next one
	for (let i = 0; i < clusters.length - 1; i++) {
		const clusterA = clusters[i];
		const clusterB = clusters[i + 1];

		// Find closest pair of cells between clusters
		let minDist = Infinity;
		let startCell, endCell;
		for (const a of clusterA) {
			for (const b of clusterB) {
				const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
				if (dist < minDist) {
					minDist = dist;
					startCell = a;
					endCell = b;
				}
			}
		}

		// Simple pathfinding (greedy, avoid river)
		const path = findPath(startCell, endCell, riverSet, citySet, width, height);
		roads.push(...path);
	}

	return roads;
}

function generateWindingPath(start, end, riverCells, existingRoads, width, height, maxDeviation = 3) {
	const path = [];
	let current = { x: start.x, y: start.y };
	const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
	const roadSet = new Set(existingRoads.map(c => `${c.x},${c.y}`));
	const visited = new Set();

	// Calculate direct line for deviation constraints
	const directDx = end.x - start.x;
	const directDy = end.y - start.y;
	const directLength = Math.sqrt(directDx * directDx + directDy * directDy);

	while (current.x !== end.x || current.y !== end.y) {
		const key = `${current.x},${current.y}`;
		if (visited.has(key)) break; // Loop prevention
		visited.add(key);

		path.push({ x: current.x, y: current.y });

		// Calculate direction toward end
		const dx = Math.sign(end.x - current.x);
		const dy = Math.sign(end.y - current.y);

		let nextX = current.x;
		let nextY = current.y;

		// 70% chance to move toward end (primary direction)
		// 30% chance to move perpendicular (creates winding)
		if (Math.random() < 0.7) {
			// Primary direction toward end
			if (Math.abs(dx) > Math.abs(dy)) {
				nextX += dx;
			} else if (dy !== 0) {
				nextY += dy;
			} else if (dx !== 0) {
				nextX += dx;
			}
		} else {
			// Perpendicular movement for winding effect
			const perpendicularMoves = [];
			if (dx !== 0) {
				// Moving horizontally toward end, try vertical perpendicular
				perpendicularMoves.push({ x: current.x, y: current.y + 1 });
				perpendicularMoves.push({ x: current.x, y: current.y - 1 });
			}
			if (dy !== 0) {
				// Moving vertically toward end, try horizontal perpendicular
				perpendicularMoves.push({ x: current.x + 1, y: current.y });
				perpendicularMoves.push({ x: current.x - 1, y: current.y });
			}

			// Try perpendicular moves first, fallback to forward
			let foundMove = false;
			for (const move of perpendicularMoves) {
				const moveKey = `${move.x},${move.y}`;
				if (move.x >= 0 && move.x < width && move.y >= 0 && move.y < height &&
					!riverSet.has(moveKey) && !roadSet.has(moveKey) && !visited.has(moveKey)) {
					nextX = move.x;
					nextY = move.y;
					foundMove = true;
					break;
				}
			}

			if (!foundMove) {
				// Fallback to forward movement
				if (Math.abs(dx) > Math.abs(dy)) {
					nextX += dx;
				} else if (dy !== 0) {
					nextY += dy;
				} else if (dx !== 0) {
					nextX += dx;
				}
			}
		}

		// Check deviation constraint
		if (directLength > 0) {
			const currentVectorX = current.x - start.x;
			const currentVectorY = current.y - start.y;
			const endVectorX = end.x - start.x;
			const endVectorY = end.y - start.y;

			// Cross product to determine if we're on the correct side of the direct line
			const cross = currentVectorX * endVectorY - currentVectorY * endVectorX;
			const deviation = Math.abs(cross) / directLength;

			if (deviation > maxDeviation) {
				// Too far from direct path, force move toward center
				if (Math.abs(dx) > Math.abs(dy)) {
					nextX = current.x + dx;
					nextY = current.y;
				} else {
					nextX = current.x;
					nextY = current.y + dy;
				}
			}
		}

		// Validate move
		const nextKey = `${nextX},${nextY}`;
		if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height &&
			!riverSet.has(nextKey) && !roadSet.has(nextKey)) {
			current.x = nextX;
			current.y = nextY;
		} else {
			// Can't move there, try alternative
			break;
		}
	}

	// Add final position if not already included
	if (path.length === 0 || (path[path.length - 1].x !== end.x || path[path.length - 1].y !== end.y)) {
		path.push({ x: end.x, y: end.y });
	}

	return path;
}

function generateBridgeRoads(bridgeLocation, cityClusters, riverCells, width, height) {
	const roadCells = [];
	const bx = bridgeLocation.x;
	const by = bridgeLocation.y;

	if (bridgeLocation.orientation === 'horizontal') {
		// Road goes E-W (river is N-S)
		// Generate winding path from west edge to bridge
		const westPath = generateWindingPath(
			{ x: 0, y: by },
			{ x: bx, y: by },
			riverCells,
			[],
			width, height,
			3
		);
		roadCells.push(...westPath);

		// Generate winding path from bridge to east edge
		const eastPath = generateWindingPath(
			{ x: bx, y: by },
			{ x: width - 1, y: by },
			riverCells,
			roadCells,
			width, height,
			3
		);
		// Skip the first cell to avoid duplicating the bridge
		roadCells.push(...eastPath.slice(1));
	} else {
		// Road goes N-S (river is E-W)
		// Generate winding path from north edge to bridge
		const northPath = generateWindingPath(
			{ x: bx, y: 0 },
			{ x: bx, y: by },
			riverCells,
			[],
			width, height,
			3
		);
		roadCells.push(...northPath);

		// Generate winding path from bridge to south edge
		const southPath = generateWindingPath(
			{ x: bx, y: by },
			{ x: bx, y: height - 1 },
			riverCells,
			roadCells,
			width, height,
			3
		);
		// Skip the first cell to avoid duplicating the bridge
		roadCells.push(...southPath.slice(1));
	}

	return roadCells;
}

function generateTownsWithRoads(mainRoadCells, riverCells, width, height) {
	const townCells = [];
	const townRoadCells = [];
	const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
	const roadSet = new Set(mainRoadCells.map(c => `${c.x},${c.y}`));

	// Pick random count: 1-3 towns
	const numTowns = Math.floor(Math.random() * 3) + 1;

	for (let i = 0; i < numTowns; i++) {
		let attempts = 0;
		let townPlaced = false;

		while (!townPlaced && attempts < 50) {
			attempts++;

			// Pick random position (not on river, not on existing road, not too close to edge)
			const margin = 3; // Keep towns away from edges
			const x = Math.floor(Math.random() * (width - 2 * margin)) + margin;
			const y = Math.floor(Math.random() * (height - 2 * margin)) + margin;

			const key = `${x},${y}`;
			if (!riverSet.has(key) && !roadSet.has(key)) {
				// Check if too close to existing towns
				let tooClose = false;
				for (const existingTown of townCells) {
					const dx = x - existingTown.x;
					const dy = y - existingTown.y;
					const distance = Math.sqrt(dx * dx + dy * dy);
					if (distance < 8) { // Minimum distance between towns
						tooClose = true;
						break;
					}
				}

				if (!tooClose) {
					// Find nearest main road cell
					let nearestRoad = null;
					let minDistance = Infinity;

					for (const roadCell of mainRoadCells) {
						const dx = x - roadCell.x;
						const dy = y - roadCell.y;
						const distance = Math.sqrt(dx * dx + dy * dy);
						if (distance < minDistance) {
							minDistance = distance;
							nearestRoad = roadCell;
						}
					}

					if (nearestRoad) {
						// Generate winding path from town to nearest road cell
						const townRoad = generateWindingPath(
							{ x, y },
							nearestRoad,
							riverCells,
							[...mainRoadCells, ...townRoadCells],
							width, height,
							2 // Smaller deviation for town roads
						);

						// Add town cell (skip the last cell as it's the road connection)
						townCells.push({ x, y });
						// Add road cells (skip first cell as it's the town)
						townRoadCells.push(...townRoad.slice(1));

						townPlaced = true;
					}
				}
			}
		}
	}

	return { townCells, townRoadCells };
}

// Detect where roads cross rivers and convert those cells to bridges
function detectRoadRiverCrossings(roadCells, riverCells, shouldLogCellInfo) {
	const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
	const bridgeCells = [];
	const filteredRoads = [];

	for (const road of roadCells) {
		const key = `${road.x},${road.y}`;
		if (riverSet.has(key)) {
			// Determine bridge orientation based on river neighbors
			const hasRiverN = riverSet.has(`${road.x},${road.y - 1}`);
			const hasRiverS = riverSet.has(`${road.x},${road.y + 1}`);
			const hasRiverE = riverSet.has(`${road.x + 1},${road.y}`);
			const hasRiverW = riverSet.has(`${road.x - 1},${road.y}`);

			// If river flows N-S, road goes E-W (horizontal bridge)
			// If river flows E-W, road goes N-S (vertical bridge)
			const orientation = (hasRiverN || hasRiverS) ? 'horizontal' : 'vertical';

			if (shouldLogCellInfo()) {
				console.log(`[Bridge detected] (${road.x},${road.y}) orientation=${orientation} ` +
					`riverNeighbors: N=${hasRiverN}, E=${hasRiverE}, S=${hasRiverS}, W=${hasRiverW}`);
			}

			bridgeCells.push({ x: road.x, y: road.y, type: 'riverbridge', orientation });
		} else {
			filteredRoads.push(road);
		}
	}

	return { bridgeCells, roadCells: filteredRoads };
}

function findNearestCityOrEdge(direction, bridgeLocation, cityClusters, maxCoord) {
	const allCities = cityClusters.flat();

	if (direction === 'west') {
		// Find nearest city to the west, or return left edge
		let nearestCity = null;
		let minDist = Infinity;
		for (const city of allCities) {
			if (city.x < bridgeLocation.x) {
				const dist = Math.abs(city.x - bridgeLocation.x) + Math.abs(city.y - bridgeLocation.y);
				if (dist < minDist) {
					minDist = dist;
					nearestCity = city;
				}
			}
		}
		return nearestCity || { x: 0, y: bridgeLocation.y };
	} else if (direction === 'east') {
		// Find nearest city to the east, or return right edge
		let nearestCity = null;
		let minDist = Infinity;
		for (const city of allCities) {
			if (city.x > bridgeLocation.x) {
				const dist = Math.abs(city.x - bridgeLocation.x) + Math.abs(city.y - bridgeLocation.y);
				if (dist < minDist) {
					minDist = dist;
					nearestCity = city;
				}
			}
		}
		return nearestCity || { x: maxCoord - 1, y: bridgeLocation.y };
	} else if (direction === 'north') {
		// Find nearest city to the north, or return top edge
		let nearestCity = null;
		let minDist = Infinity;
		for (const city of allCities) {
			if (city.y < bridgeLocation.y) {
				const dist = Math.abs(city.x - bridgeLocation.x) + Math.abs(city.y - bridgeLocation.y);
				if (dist < minDist) {
					minDist = dist;
					nearestCity = city;
				}
			}
		}
		return nearestCity || { x: bridgeLocation.x, y: 0 };
	} else if (direction === 'south') {
		// Find nearest city to the south, or return bottom edge
		let nearestCity = null;
		let minDist = Infinity;
		for (const city of allCities) {
			if (city.y > bridgeLocation.y) {
				const dist = Math.abs(city.x - bridgeLocation.x) + Math.abs(city.y - bridgeLocation.y);
				if (dist < minDist) {
					minDist = dist;
					nearestCity = city;
				}
			}
		}
		return nearestCity || { x: bridgeLocation.x, y: maxCoord - 1 };
	}

	return bridgeLocation; // fallback
}

function findPath(start, end, riverSet, citySet, width, height) {
	const path = [];
	let current = { x: start.x, y: start.y };
	const visited = new Set();

	// Determine if target is a city cell or map edge
	const targetIsCity = citySet.has(`${end.x},${end.y}`);
	const targetIsEdge = end.x === 0 || end.x === width - 1 || end.y === 0 || end.y === height - 1;

	while (current.x !== end.x || current.y !== end.y) {
		visited.add(`${current.x},${current.y}`);

		// Check if we're adjacent to a city (success condition for city target)
		if (targetIsCity) {
			const adjacentToCity =
				citySet.has(`${current.x},${current.y - 1}`) ||
				citySet.has(`${current.x + 1},${current.y}`) ||
				citySet.has(`${current.x},${current.y + 1}`) ||
				citySet.has(`${current.x - 1},${current.y}`);
			if (adjacentToCity) {
				// Add current to path (it's the road end touching city)
				path.push({ x: current.x, y: current.y });
				break; // Successfully reached city
			}
		}

		// Check if we've reached map edge (success for edge target)
		if (targetIsEdge) {
			const atEdge = current.x === 0 || current.x === width - 1 ||
				current.y === 0 || current.y === height - 1;
			if (atEdge) {
				path.push({ x: current.x, y: current.y });
				break; // Successfully reached edge
			}
		}

		// Prefer moving toward target
		const dx = Math.sign(end.x - current.x);
		const dy = Math.sign(end.y - current.y);

		// Try directions in order of preference
		const moves = [];
		if (dx !== 0) moves.push({ x: current.x + dx, y: current.y });
		if (dy !== 0) moves.push({ x: current.x, y: current.y + dy });
		// Add perpendicular moves as fallback
		if (dy !== 0) moves.push({ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y });
		if (dx !== 0) moves.push({ x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 });

		let moved = false;
		for (const next of moves) {
			const key = `${next.x},${next.y}`;
			if (next.x >= 0 && next.x < width && next.y >= 0 && next.y < height &&
				!riverSet.has(key) && !visited.has(key)) {
				// Allow moving through city cells if target is city (for adjacency checking)
				if (!targetIsCity || !citySet.has(key)) {
					if (!citySet.has(`${current.x},${current.y}`)) {
						path.push({ x: current.x, y: current.y });
					}
					current = next;
					moved = true;
					break;
				}
			}
		}

		if (!moved) break; // Stuck, give up
	}

	return path;
}

// Generate a road crossing the river with a bridge
function generateBridgeCrossing(riverCells, cityClusters, width, height, probability = 0.8) {
	if (Math.random() > probability) return { bridgeCells: [], roadCells: [] };

	const bridgeCells = [];
	const roadCells = [];

	// Find good crossing points (where river flows vertically - consecutive cells with same x)
	const crossingCandidates = [];
	for (let i = 1; i < riverCells.length - 1; i++) {
		const prev = riverCells[i - 1];
		const curr = riverCells[i];
		const next = riverCells[i + 1];

		// Check if river is flowing vertically (same x for 3+ consecutive cells)
		if (prev.x === curr.x && curr.x === next.x) {
			// Avoid edges of map
			if (curr.x > 2 && curr.x < width - 3 && curr.y > 1 && curr.y < height - 2) {
				crossingCandidates.push(curr);
			}
		}
	}

	if (crossingCandidates.length === 0) return { bridgeCells: [], roadCells: [] };

	// Pick a random crossing point
	const crossingPoint = crossingCandidates[Math.floor(Math.random() * crossingCandidates.length)];

	bridgeCells.push({ x: crossingPoint.x, y: crossingPoint.y, type: 'riverbridge' });

	const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
	const citySet = new Set(cityClusters.flat().map(c => `${c.x},${c.y}`));

	// Extend road WEST until hitting city or map edge
	let x = crossingPoint.x - 1;
	while (x >= 0) {
		const key = `${x},${crossingPoint.y}`;
		if (citySet.has(key)) break;  // Reached city
		if (!riverSet.has(key)) {
			roadCells.push({ x: x, y: crossingPoint.y });
		}
		x--;
	}
	// If didn't reach city, road goes to edge (x < 0)

	// Extend road EAST until hitting city or map edge
	x = crossingPoint.x + 1;
	while (x < width) {
		const key = `${x},${crossingPoint.y}`;
		if (citySet.has(key)) break;  // Reached city
		if (!riverSet.has(key)) {
			roadCells.push({ x: x, y: crossingPoint.y });
		}
		x++;
	}
	// If didn't reach city, road goes to edge (x >= width)

	console.log(`Generated bridge crossing at (${crossingPoint.x}, ${crossingPoint.y}) with ${roadCells.length} road cells`);

	return { bridgeCells, roadCells };
}


class Cell {
	constructor(x, y) {
		this.x = x;
		this.y = y;
		this.options = [...Array(ALL_TILES.length).keys()];
		this.collapsed = false;
		this.tile = null;
		this.preferredType = null; // 'road', 'water', 'city', or null
	}

	get entropy() {
		let entropy = this.options.length;

		// If we have a preferred type, slightly bias towards tiles of that type
		if (this.preferredType) {
			const preferredTiles = this.options.filter(optIdx => {
				const tileName = ALL_TILES[optIdx].name.toLowerCase();
				return tileName.includes(this.preferredType);
			});
			if (preferredTiles.length > 0) {
				// Reduce entropy slightly for cells with preferred type options
				entropy -= 0.1;
			}
		}

		return entropy;
	}
}

export class WFC {
	constructor(width, height, dependencies) {
		if (!dependencies || typeof dependencies.shouldLogCellInfo !== 'function') throw new Error('expected shouldLogCellInfo dependency');
		this.width = width;
		this.height = height;
		this.shouldLogCellInfo = dependencies.shouldLogCellInfo;
		this.grid = [];
		this.history = [];
		this.reset();
	}

	reset() {
		this.grid = [];
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid.push(new Cell(x, y));
			}
		}
		this.history = [];
		this.isDone = false;
		this.tileCounts = {};
		// Initialize all tile names to 0
		TILE_DEFS.forEach(tileDef => {
			this.tileCounts[tileDef.name] = 0;
		});
	}

	// Helper: constrain cells for infrastructure (river/road)
	// Less strict: require matching edges ONLY in directions with neighbors
	// For directions WITHOUT neighbors, allow edges that can terminate (G, W, etc.)
	constrainInfrastructureCells(cells, edgeType, cellSet) {
		const dirIdx = { 'N': 0, 'E': 1, 'S': 2, 'W': 3 };
		const nameMap = { [RV]: 'river', [R]: 'road', [F]: 'forest' };

		// At very top of constrainInfrastructureCells, before the for loop:
		if (this.shouldLogCellInfo() && edgeType === F) {  // Only for forest
			const forestCellsWithLowOptions = cells.filter(({ x, y }) => {
				const cell = this.grid[y * this.width + x];
				return cell.options.length < 50;
			});
			if (forestCellsWithLowOptions.length > 0) {
				console.warn(`[Forest pre-check] ${forestCellsWithLowOptions.length} forest cells already have reduced options:`,
					forestCellsWithLowOptions.map(({ x, y }) => {
						const cell = this.grid[y * this.width + x];
						return `(${x},${y}):${cell.options.length}`;
					}).join(', '));
			}
		}

		// At the very start of the function, before any filtering:
		if (this.shouldLogCellInfo()) {
			for (const { x, y } of cells) {
				const cell = this.grid[y * this.width + x];
				if (cell.constrainedBy?.length > 0) {
					console.log(`Cell (${x},${y}) already constrained by: ${cell.constrainedBy.join(', ')}, options: ${cell.options.length}`);
				}
			}
		}

		for (const { x, y } of cells) {
			// Bounds check - skip cells outside grid
			if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

			const cell = this.grid[y * this.width + x];
			if (cell.collapsed) continue;

			// Determine which neighbors are same type
			const hasN = cellSet.has(`${x},${y - 1}`);
			const hasE = cellSet.has(`${x + 1},${y}`);
			const hasS = cellSet.has(`${x},${y + 1}`);
			const hasW = cellSet.has(`${x - 1},${y}`);

			// At borders, treat as continuing for rivers/roads
			const atN = y === 0;
			const atS = y === this.height - 1;
			const atE = x === this.width - 1;
			const atW = x === 0;

			// Required edges: must have edgeType in these directions
			const requiredDirs = [];
			if (hasN || ((edgeType === RV || edgeType === R) && atN)) requiredDirs.push('N');
			if (hasE || ((edgeType === RV || edgeType === R) && atE)) requiredDirs.push('E');
			if (hasS || ((edgeType === RV || edgeType === R) && atS)) requiredDirs.push('S');
			if (hasW || ((edgeType === RV || edgeType === R) && atW)) requiredDirs.push('W');

			const beforeCount = cell.options.length;
			const originalOptions = [...cell.options];  // Save for diagnostics

			// Filter tiles: must have correct edge type in ALL required directions
			cell.options = cell.options.filter(optIdx => {
				const tile = ALL_TILES[optIdx];
				// Check all required directions have the correct edge
				for (const dir of requiredDirs) {
					if (tile.edges[dirIdx[dir]] !== edgeType) {
						return false;
					}
				}
				// Also must have at least one edge of this type (sanity check)
				return tile.edges.includes(edgeType);
			});

			cell.preferredType = nameMap[edgeType] || null;

			// Track what constrained this cell
			if (cell.options.length < beforeCount) {
				cell.constrainedBy = cell.constrainedBy || [];
				cell.constrainedBy.push(edgeType);
			}

			if (cell.options.length === 0) {
				if (this.shouldLogCellInfo()) {
					console.group(`[${edgeType} Constraint Failure] Cell (${x},${y})`);
					console.log(`Required: ${edgeType} edges on [${requiredDirs.join(', ') || 'any'}]`);
					console.log(`Had ${beforeCount} options before constraint`);
					console.log(`Previous constraints on this cell: ${cell.constrainedBy?.join(', ') || 'none'}`);

					// Analyze what edges the original options had
					const edgeCounts = { N: {}, E: {}, S: {}, W: {} };
					originalOptions.forEach(optIdx => {
						const edges = ALL_TILES[optIdx].edges;
						['N', 'E', 'S', 'W'].forEach((d, i) => {
							edgeCounts[d][edges[i]] = (edgeCounts[d][edges[i]] || 0) + 1;
						});
					});
					console.log('Edge distribution in original options:', edgeCounts);

					// Check if ANY option had the required edge type
					const hadAnyForest = originalOptions.some(optIdx =>
						ALL_TILES[optIdx].edges.includes(edgeType));
					console.log(`Any option had ${edgeType}? ${hadAnyForest}`);
					console.groupEnd();
				}
			}
		}
	}

	preseedBridgeCells(bridgeCells) {
		for (const cell of bridgeCells) {
			const idx = cell.y * this.width + cell.x;
			if (idx < 0 || idx >= this.grid.length) continue;

			const gridCell = this.grid[idx];
			if (gridCell.collapsed) continue;

			if (this.shouldLogCellInfo()) {
				console.log(`[Bridge constraint] Constraining (${cell.x},${cell.y}) to RiverBridge, orientation=${cell.orientation}`);
			}

			// Bridge tiles have specific edge patterns
			if (cell.orientation === 'vertical') {
				// Road N-S, river E-W: edges [R, RV, R, RV]
				this.constrainCellEdges(gridCell, { N: R, E: RV, S: R, W: RV });
			} else {
				// Road E-W, river N-S: edges [RV, R, RV, R]
				this.constrainCellEdges(gridCell, { N: RV, E: R, S: RV, W: R });
			}

			// Also constrain by name for extra safety
			this.constrainCellByName(gridCell, 'RiverBridge');

			if (this.shouldLogCellInfo()) {
				console.log(`Constrained bridge at (${cell.x}, ${cell.y}) to ${gridCell.options.length} options`);
			}
		}

		// After constraining all bridge cells, check for orientation conflicts
		if (this.shouldLogCellInfo()) {
			const bridgeMap = new Map(bridgeCells.map(c => [`${c.x},${c.y}`, c.orientation]));
			for (const cell of bridgeCells) {
				const neighbors = [
					{ dx: 1, dy: 0, dir: 'E' },
					{ dx: -1, dy: 0, dir: 'W' },
					{ dx: 0, dy: 1, dir: 'S' },
					{ dx: 0, dy: -1, dir: 'N' }
				];
				for (const n of neighbors) {
					const neighborKey = `${cell.x + n.dx},${cell.y + n.dy}`;
					const neighborOrientation = bridgeMap.get(neighborKey);
					if (neighborOrientation && neighborOrientation !== cell.orientation) {
						console.warn(`[Bridge orientation conflict] (${cell.x},${cell.y}) is ${cell.orientation}, ` +
							`but neighbor (${cell.x + n.dx},${cell.y + n.dy}) is ${neighborOrientation}`);
					}
				}
			}
		}
	}

	preseed() {
		// New bridge-first generation architecture
		const bridgeLocation = generateBridgeLocation(this.width, this.height, []); // Empty cityClusters initially
		const riverCells = generateRiver(this.width, this.height, bridgeLocation);
		const cityClusters = []; // Let WFC handle cities naturally
		const roadCells = generateBridgeRoads(bridgeLocation, cityClusters, riverCells, this.width, this.height);
		const { townCells, townRoadCells } = generateTownsWithRoads(roadCells, riverCells, this.width, this.height);

		// Create bridge cells at the bridge location
		const bridgeCells = [{ x: bridgeLocation.x, y: bridgeLocation.y, type: 'riverbridge', orientation: bridgeLocation.orientation }];

		// Detect road-river crossings and convert them to bridges
		const allRoadCellsForBridgeDetection = [...roadCells, ...townRoadCells];
		const { bridgeCells: detectedBridges, roadCells: cleanRoads } =
			detectRoadRiverCrossings(allRoadCellsForBridgeDetection, riverCells, this.shouldLogCellInfo);
		// All road cells including town roads
		const allRoadCells = cleanRoads;
		// Merge with existing bridge cells
		const allBridgeCells = [...bridgeCells, ...detectedBridges];

		// Generate forests AFTER all infrastructure, so they avoid roads and bridges
		const allInfrastructure = [...allRoadCells, ...allBridgeCells];
		const forestBlobs = generateForestBlobs(this.width, this.height, riverCells, cityClusters, townCells, allInfrastructure);

		const cityCells = cityClusters.flat(); // Will be empty
		const forestCells = forestBlobs.flat();

		if (this.shouldLogCellInfo()) {
			console.log(`Generated: ${riverCells.length} river, ${townCells.length} town, ${cityCells.length} city, ${forestCells.length} forest cells, ${allBridgeCells.length} bridge cells, ${allRoadCells.length} road cells`);
		}

		const debugCell = (label) => {
			const problemCells = forestCells.filter(fc => {
				const cell = this.grid[fc.y * this.width + fc.x];
				return cell && cell.options.length < 50;
			});
			if (problemCells.length > 0) {
				console.log(`[${label}] Forest cells with reduced options:`,
					problemCells.map(fc => `(${fc.x},${fc.y}):${this.grid[fc.y * this.width + fc.x].options.length}`).join(', '));
			}
		};

		// Helper to check for early contradictions
		const checkForContradictions = (phase) => {
			const badCells = this.grid.filter(c => !c.collapsed && c.options.length === 0);
			if (badCells.length > 0) {
				console.error(`[${phase}] ${badCells.length} cells have 0 options:`,
					badCells.map(c => `(${c.x},${c.y})`).join(', '));
				return true;
			}
			return false;
		};

		// Create sets for edge constraint lookups
		const riverSet = new Set(riverCells.map(c => `${c.x},${c.y}`));
		const roadSet = new Set([...allRoadCells, ...allBridgeCells].map(c => `${c.x},${c.y}`));
		const bridgeSet = new Set(allBridgeCells.map(c => `${c.x},${c.y}`));

		// Check for forest cells adjacent to roads (potential conflicts)
		if (this.shouldLogCellInfo()) {
			const forestAdjacentToRoad = forestCells.filter(fc => {
				return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) =>
					roadSet.has(`${fc.x + dx},${fc.y + dy}`));
			});
			if (forestAdjacentToRoad.length > 0) {
				console.warn(`[Potential conflict] ${forestAdjacentToRoad.length} forest cells adjacent to roads:`,
					forestAdjacentToRoad.map(c => `(${c.x},${c.y})`).join(', '));
			}
		}

		// Skip river cells that are at bridge locations (bridge will overwrite)
		const riverOnlyCells = riverCells.filter(c => !bridgeSet.has(`${c.x},${c.y}`));

		// CONSTRAIN river cells (excluding bridge locations)
		this.constrainInfrastructureCells(riverOnlyCells, RV, new Set([...riverCells, ...allBridgeCells].map(c => `${c.x},${c.y}`)));
		checkForContradictions('After river constraint');
		if (this.shouldLogCellInfo()) debugCell('After river');

		// CONSTRAIN bridge cells
		this.preseedBridgeCells(allBridgeCells);
		checkForContradictions('After bridge constraint');
		if (this.shouldLogCellInfo()) debugCell('After bridge');

		// CONSTRAIN road cells (excluding bridges which were already constrained)
		const roadOnlyCells = allRoadCells.filter(c => !bridgeSet.has(`${c.x},${c.y}`));
		this.constrainInfrastructureCells(roadOnlyCells, R, roadSet);
		checkForContradictions('After road constraint');
		if (this.shouldLogCellInfo()) debugCell('After road');

		// Check if any forest cells are also town cells
		if (this.shouldLogCellInfo()) {
			const forestTownOverlap = forestCells.filter(fc =>
				townCells.some(tc => tc.x === fc.x && tc.y === fc.y)
			);
			if (forestTownOverlap.length > 0) {
				console.warn('[Overlap] Forest cells that are also town cells:',
					forestTownOverlap.map(c => `(${c.x},${c.y})`).join(', '));
			}
		}

		// CONSTRAIN town cells - need city tiles with at least one road edge
		for (const { x, y } of townCells) {
			// Bounds check - skip cells outside grid
			if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

			const cell = this.grid[y * this.width + x];
			if (cell.collapsed) continue;

			// Filter to tiles that are city-related AND have at least one road edge
			cell.options = cell.options.filter(optIdx => {
				const tile = ALL_TILES[optIdx];
				const isCityTile = tile.name.toLowerCase().includes('city') ||
					tile.edges.includes(C);
				const hasRoadEdge = tile.edges.includes(R);
				return isCityTile && hasRoadEdge;
			});
			cell.preferredType = 'city';
		}
		checkForContradictions('After town constraint');
		if (this.shouldLogCellInfo()) debugCell('After town');

		// CONSTRAIN forest cells (excluding any that overlap with other infrastructure)
		const infrastructureSet = new Set([...riverCells, ...allRoadCells, ...allBridgeCells].map(c => `${c.x},${c.y}`));

		// Create bridge buffer zone - cells adjacent to bridges can't be forest
		const bridgeBufferSet = new Set();
		for (const bridge of allBridgeCells) {
			bridgeBufferSet.add(`${bridge.x},${bridge.y}`);
			// Add all 4 adjacent cells to buffer
			[[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
				bridgeBufferSet.add(`${bridge.x + dx},${bridge.y + dy}`);
			});
		}

		// Helper function to check if a cell is adjacent to any road
		const isAdjacentToRoad = (cell, roadSet) => {
			return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) =>
				roadSet.has(`${cell.x + dx},${cell.y + dy}`));
		};

		const forestOnlyCells = forestCells.filter(c =>
			!infrastructureSet.has(`${c.x},${c.y}`) &&
			!bridgeBufferSet.has(`${c.x},${c.y}`) &&  // Exclude cells adjacent to bridges
			!isAdjacentToRoad(c, roadSet)  // Exclude cells adjacent to roads
		);

		if (this.shouldLogCellInfo() && forestCells.length !== forestOnlyCells.length) {
			const excluded = forestCells.filter(c => bridgeBufferSet.has(`${c.x},${c.y}`));
			console.log(`[Bridge buffer] Excluded ${excluded.length} forest cells adjacent to bridges:`,
				excluded.map(c => `(${c.x},${c.y})`).join(', '));
		}

		// Right before: this.constrainInfrastructureCells(forestOnlyCells, F, ...)
		if (this.shouldLogCellInfo()) {
			console.log('[Order check] About to run forest constraint');
		}

		this.constrainInfrastructureCells(forestOnlyCells, F, new Set(forestOnlyCells.map(c => `${c.x},${c.y}`)));
		checkForContradictions('After forest constraint');

		// IMPORTANT: Restrict non-preseeded cells BEFORE propagation
		// This ensures non-infrastructure cells can only have terminator tiles,
		// which prevents contradictions when propagation tries to match edges
		this.restrictToPreseededInfrastructure(riverCells, allRoadCells, allBridgeCells);
		checkForContradictions('After restriction');

		// Propagate constraints from constrained cells that STILL HAVE OPTIONS
		const constrainedCells = this.grid.filter(c =>
			c.options.length > 0 && c.options.length < ALL_TILES.length && !c.collapsed
		);
		if (this.shouldLogCellInfo()) {
			console.log(`Propagating from ${constrainedCells.length} constrained cells...`);
		}
		const propagateSuccess = this.propagateStack([...constrainedCells]);
		if (!propagateSuccess) {
			console.warn('Propagation caused a contradiction during preseed!');
		}
	}

	collapseCell(cell, tile) {
		cell.collapsed = true;
		cell.tile = tile;
		cell.options = [tile.id];
		this.tileCounts[tile.name] = (this.tileCounts[tile.name] || 0) + 1;
	}

	// Constrain a cell's options based on required edge types
	// edgeConstraints: { N: type, E: type, S: type, W: type } - only specified edges are required
	constrainCellEdges(cell, edgeConstraints) {
		if (cell.collapsed) return; // Don't constrain already-collapsed cells

		const dirIdx = { 'N': 0, 'E': 1, 'S': 2, 'W': 3 };

		cell.options = cell.options.filter(optIdx => {
			const tile = ALL_TILES[optIdx];
			for (const [dir, requiredEdge] of Object.entries(edgeConstraints)) {
				if (tile.edges[dirIdx[dir]] !== requiredEdge) {
					return false;
				}
			}
			return true;
		});
	}

	// Constrain cell to tiles matching a name pattern
	constrainCellByName(cell, namePattern) {
		if (cell.collapsed) return;

		cell.options = cell.options.filter(optIdx => {
			const tile = ALL_TILES[optIdx];
			return tile.name.toLowerCase().includes(namePattern.toLowerCase());
		});
	}

	// Constrain cell to tiles where at least one edge matches any of the given types
	constrainCellHasAnyEdge(cell, edgeTypes) {
		if (cell.collapsed) return;

		cell.options = cell.options.filter(optIdx => {
			const tile = ALL_TILES[optIdx];
			return tile.edges.some(edge => edgeTypes.includes(edge));
		});
	}

	step() {
		if (this.isDone) return false;

		// 1. Find cell with lowest entropy (minimum options > 1)
		let minEntropy = Infinity;
		let candidates = [];

		for (let cell of this.grid) {
			if (!cell.collapsed) {
				if (cell.entropy < minEntropy) {
					minEntropy = cell.entropy;
					candidates = [cell];
				} else if (cell.entropy === minEntropy) {
					candidates.push(cell);
				}
			}
		}

		if (candidates.length === 0) {
			this.isDone = true;
			return false;
		}

		// 2. Collapse one cell
		const cell = candidates[Math.floor(Math.random() * candidates.length)];
		if (cell.options.length === 0) {
			// Contradiction - attempt backtracking
			if (this.history.length > 0) {
				console.log(`Contradiction at (${cell.x}, ${cell.y}), backtracking...`);
				return this.backtrack();
			}
			console.error("Contradiction at", cell.x, cell.y, "- no history to backtrack");
			this.isDone = true;
			return false;
		}

		// Save state for backtracking
		this.saveState(cell);

		// Use weighted random selection with lookahead constraint
		let safeOptions = cell.options.filter(optIdx =>
			!this.wouldCreateDeadEnd(cell, optIdx)
		);
		// Fall back to all options if filtering removes everything
		if (safeOptions.length === 0) {
			safeOptions = cell.options;
		}
		const pick = this.weightedPick(safeOptions);
		cell.options = [pick];
		cell.collapsed = true;
		cell.tile = ALL_TILES[pick];

		// 3. Increment tile count
		const tileName = cell.tile.name;
		this.tileCounts[tileName] = (this.tileCounts[tileName] || 0) + 1;

		// 4. Propagate
		const propagateSuccess = this.propagate(cell);

		// Check if propagation caused contradiction
		if (!propagateSuccess && this.history.length > 0) {
			return this.backtrack();
		}

		return true;
	}

	// Weighted random pick based on tile weights
	weightedPick(options) {
		let totalWeight = 0;
		const weights = options.map(optIdx => {
			const tile = ALL_TILES[optIdx];
			const tileDef = TILE_DEFS.find(d => d.name === tile.name);
			// Use customWeight if set (non-zero), otherwise use defaultWeight
			const weight = tileDef ? (tileDef.customWeight > 0 ? tileDef.customWeight : tileDef.defaultWeight) : 1;
			totalWeight += weight;
			return weight;
		});

		let random = Math.random() * totalWeight;
		for (let i = 0; i < options.length; i++) {
			random -= weights[i];
			if (random <= 0) return options[i];
		}
		return options[options.length - 1];
	}

	// Save grid state for backtracking
	saveState(triggerCell) {
		// Only keep recent history to limit memory
		if (this.history.length > 50) {
			this.history.shift();
		}

		const snapshot = {
			triggerCellIndex: triggerCell.y * this.width + triggerCell.x,
			triedOptions: [this.weightedPick(triggerCell.options)], // Track what we tried
			remainingOptions: [...triggerCell.options],
			grid: this.grid.map(cell => ({
				options: [...cell.options],
				collapsed: cell.collapsed,
				tileId: cell.tile ? cell.tile.id : null
			})),
			tileCounts: { ...this.tileCounts }
		};
		this.history.push(snapshot);
	}

	// Backtrack to previous state and try different option
	backtrack() {
		let attempts = 0;
		const maxAttempts = 10;

		while (this.history.length > 0 && attempts < maxAttempts) {
			const snapshot = this.history.pop();

			// Restore grid state
			snapshot.grid.forEach((cellData, i) => {
				const cell = this.grid[i];
				cell.options = [...cellData.options];
				cell.collapsed = cellData.collapsed;
				cell.tile = cellData.tileId !== null ? ALL_TILES[cellData.tileId] : null;
			});
			this.tileCounts = { ...snapshot.tileCounts };

			// Try a different option for the trigger cell
			const triggerCell = this.grid[snapshot.triggerCellIndex];
			const remaining = triggerCell.options.filter(option =>
				!snapshot.triedOptions.includes(option)
			);

			if (remaining.length > 0) {
				// Try a different option
				const pick = this.weightedPick(remaining);
				triggerCell.options = [pick];
				triggerCell.collapsed = true;
				triggerCell.tile = ALL_TILES[pick];

				const tileName = triggerCell.tile.name;
				this.tileCounts[tileName] = (this.tileCounts[tileName] || 0) + 1;

				this.propagate(triggerCell);
				console.log(`Backtracked to (${triggerCell.x}, ${triggerCell.y}), trying different tile`);
				return true;
			}

			attempts++;
		}

		console.error("Backtracking failed after", attempts, "attempts");
		this.isDone = true;
		return false;
	}

	propagate(startCell) {
		return this.propagateStack([startCell]);
	}

	propagateStack(stack) {
		while (stack.length > 0) {
			const current = stack.pop();

			const neighbors = this.getNeighbors(current);
			for (let direction in neighbors) {
				const neighbor = neighbors[direction];
				if (neighbor.collapsed) continue;

				const oppositeDir = { 'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E' }[direction];
				const dirIdx = { 'N': 0, 'E': 1, 'S': 2, 'W': 3 };
				const oppIdx = dirIdx[oppositeDir];
				const curIdx = dirIdx[direction];

				// Filter neighbor options based on current cell's possible tiles
				const validNeighborEdges = new Set();
				current.options.forEach(optIdx => {
					validNeighborEdges.add(ALL_TILES[optIdx].edges[curIdx]);
				});

				const nextOptions = neighbor.options.filter(optIdx => {
					return validNeighborEdges.has(ALL_TILES[optIdx].edges[oppIdx]);
				});

				if (nextOptions.length < neighbor.options.length) {
					neighbor.options = nextOptions;
					if (neighbor.options.length === 0) {
						// Log what edges are needed for debugging
						const neededEdges = Array.from(validNeighborEdges);
						console.log(`Contradiction: Cell (${neighbor.x},${neighbor.y}) needs ${oppositeDir}=[${neededEdges.join(',')}] but no tiles match`);
						console.log(`Constrained by cell (${current.x},${current.y}) with ${current.options.length} possible tiles`);
						console.log(`Current cell possible tiles:`, current.options.map(idx => ALL_TILES[idx].name));
						return false; // Signal contradiction for backtracking
					}
					stack.push(neighbor);
				}
			}
		}
		return true; // Success
	}

	restrictToPreseededInfrastructure(riverCells, roadCells, bridgeCells) {
		// At the start of restrictToPreseededInfrastructure
		if (this.shouldLogCellInfo()) {
			console.log('[Order check] Running restrictToPreseededInfrastructure');
		}

		const infrastructureSet = new Set([
			...riverCells.map(c => `${c.x},${c.y}`),
			...roadCells.map(c => `${c.x},${c.y}`),
			...bridgeCells.map(c => `${c.x},${c.y}`)
		]);

		if (this.shouldLogCellInfo()) {
			console.log(`Infrastructure set contains ${infrastructureSet.size} cells:`,
				Array.from(infrastructureSet).slice(0, 20).join(' | '));
		}

		// Tiles that CONTINUE infrastructure (have 2+ river/road edges) - block these
		const continuationTiles = new Set([
			'RiverStraight', 'RiverCorner', 'RiverT', 'RiverCross',
			'RoadStraight', 'RoadCorner', 'RoadT', 'RoadCross',
			'RiverBridge', 'Bridge', 'RiverForest',
			'RoadCityEnd', 'RoadCitySide', 'RoadCityCross', 'RoadCity'
		]);

		// Tiles that TERMINATE/TRANSITION are OK: RiverEnd, RoadEnd, RiverLake, RiverWaterEdge, RoadWaterEdge

		for (const cell of this.grid) {
			const key = `${cell.x},${cell.y}`;
			if (infrastructureSet.has(key)) continue;
			if (cell.collapsed) continue;

			// Skip cells that have already been constrained by other infrastructure
			// (e.g., forest cells adjacent to road - don't break their constraints)
			if (cell.options.length < ALL_TILES.length) continue;

			// Remove only continuation tiles, keep terminators
			const newOptions = cell.options.filter(optIdx => {
				const tile = ALL_TILES[optIdx];
				return !continuationTiles.has(tile.name);
			});

			// Only apply if it wouldn't leave 0 options
			if (newOptions.length > 0) {
				cell.options = newOptions;
			}
		}
	}

	getNeighbors(cell) {
		const n = {};
		if (cell.y > 0) n['N'] = this.grid[(cell.y - 1) * this.width + cell.x];
		if (cell.x < this.width - 1) n['E'] = this.grid[cell.y * this.width + (cell.x + 1)];
		if (cell.y < this.height - 1) n['S'] = this.grid[(cell.y + 1) * this.width + cell.x];
		if (cell.x > 0) n['W'] = this.grid[cell.y * this.width + (cell.x - 1)];
		return n;
	}

	// Check if placing a tile would create a dead-end situation
	wouldCreateDeadEnd(cell, tileIdx) {
		const tile = ALL_TILES[tileIdx];
		const neighbors = this.getNeighbors(cell);
		const dirIdx = { 'N': 0, 'E': 1, 'S': 2, 'W': 3 };
		const oppositeDir = { 'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E' };

		// For each edge that's ROAD or RIVER
		for (const [dir, neighbor] of Object.entries(neighbors)) {
			if (!neighbor || neighbor.collapsed) continue;

			const edgeType = tile.edges[dirIdx[dir]];
			if (edgeType !== 'ROAD' && edgeType !== 'RIVER') continue;

			// Check if neighbor has any continuation tiles for this edge
			const oppIdx = dirIdx[oppositeDir[dir]];
			const continuationOptions = neighbor.options.filter(optIdx => {
				const neighborTile = ALL_TILES[optIdx];
				// Must match our edge
				if (neighborTile.edges[oppIdx] !== edgeType) return false;
				// Must have at least one other edge of same type (continuation)
				const otherEdges = neighborTile.edges.filter((e, i) =>
					i !== oppIdx && e === edgeType
				);
				return otherEdges.length > 0;
			});

			// If no continuation options AND neighbor would have only 1-2 total options, risky
			if (continuationOptions.length === 0) {
				const matchingOptions = neighbor.options.filter(optIdx =>
					ALL_TILES[optIdx].edges[oppIdx] === edgeType
				);
				if (matchingOptions.length <= 2) {
					return true; // Would likely create dead-end
				}
			}
		}
		return false;
	}
}
