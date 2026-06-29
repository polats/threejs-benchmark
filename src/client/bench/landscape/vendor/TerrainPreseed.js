export function generateBridgeLocation(width, height, cityClusters) {
	const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
	const citySet = new Set(cityClusters.flat().map(cell => `${cell.x},${cell.y}`));
	let x;
	let y;
	let attempts = 0;
	do {
		x = 3 + Math.floor(Math.random() * (width - 6));
		y = 3 + Math.floor(Math.random() * (height - 6));
		attempts++;
	} while (attempts < 50 && isNearCities(x, y, citySet, 3));

	return { x, y, orientation };
}

export function generateRiver(width, height, bridgeLocation) {
	const riverCells = [];
	const bridgeX = bridgeLocation.x;
	const bridgeY = bridgeLocation.y;

	if (bridgeLocation.orientation === 'horizontal') {
		for (let y = 0; y < bridgeY; y++) {
			riverCells.push({ x: bridgeX, y });
		}
		for (let y = bridgeY + 1; y < height; y++) {
			riverCells.push({ x: bridgeX, y });
		}
	} else {
		for (let x = 0; x < bridgeX; x++) {
			riverCells.push({ x, y: bridgeY });
		}
		for (let x = bridgeX + 1; x < width; x++) {
			riverCells.push({ x, y: bridgeY });
		}
	}

	return riverCells;
}

export function generateCityClusters(width, height, riverCells) {
	const riverSet = new Set(riverCells.map(cell => `${cell.x},${cell.y}`));
	const clusters = [];
	const clusterCount = 1 + Math.floor(Math.random() * 2);

	for (let i = 0; i < clusterCount; i++) {
		let attempts = 0;
		let seedX;
		let seedY;

		do {
			seedX = 1 + Math.floor(Math.random() * (width - 2));
			seedY = 1 + Math.floor(Math.random() * (height - 2));
			attempts++;
		} while (attempts < 50 && (
			isNearRiver(seedX, seedY, riverSet, 2) ||
			isNearClusters(seedX, seedY, clusters, 4)
		));

		if (attempts >= 50) continue;

		const cluster = [{ x: seedX, y: seedY }];
		const clusterSize = 3 + Math.floor(Math.random() * 3);

		for (let j = 1; j < clusterSize; j++) {
			const parent = cluster[Math.floor(Math.random() * cluster.length)];
			const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
			const shuffled = directions.sort(() => Math.random() - 0.5);

			for (const [dx, dy] of shuffled) {
				const nextX = parent.x + dx;
				const nextY = parent.y + dy;
				if (nextX > 0 && nextX < width - 1 && nextY > 0 && nextY < height - 1 &&
					!riverSet.has(`${nextX},${nextY}`) &&
					!cluster.some(cell => cell.x === nextX && cell.y === nextY)) {
					cluster.push({ x: nextX, y: nextY });
					break;
				}
			}
		}
		clusters.push(cluster);
	}
	return clusters;
}

export function isNearRiver(x, y, riverSet, margin) {
	for (let dx = -margin; dx <= margin; dx++) {
		for (let dy = -margin; dy <= margin; dy++) {
			if (riverSet.has(`${x + dx},${y + dy}`)) return true;
		}
	}
	return false;
}

export function isNearClusters(x, y, clusters, margin) {
	for (const cluster of clusters) {
		for (const cell of cluster) {
			if (Math.abs(cell.x - x) <= margin && Math.abs(cell.y - y) <= margin) {
				return true;
			}
		}
	}
	return false;
}

export function isNearCities(x, y, citySet, margin) {
	for (let dx = -margin; dx <= margin; dx++) {
		for (let dy = -margin; dy <= margin; dy++) {
			if (citySet.has(`${x + dx},${y + dy}`)) return true;
		}
	}
	return false;
}

export function generateForestBlobs(width, height, riverCells, cityClusters, townCells = [], infrastructureCells = []) {
	const riverSet = new Set(riverCells.map(cell => `${cell.x},${cell.y}`));
	const citySet = new Set(cityClusters.flat().map(cell => `${cell.x},${cell.y}`));
	const townSet = new Set(townCells.map(cell => `${cell.x},${cell.y}`));
	const infrastructureSet = new Set(infrastructureCells.map(cell => `${cell.x},${cell.y}`));
	const blobs = [];
	const blobCount = 1 + Math.floor(Math.random() * 3);

	for (let i = 0; i < blobCount; i++) {
		let attempts = 0;
		let seedX;
		let seedY;

		do {
			seedX = 1 + Math.floor(Math.random() * (width - 2));
			seedY = 1 + Math.floor(Math.random() * (height - 2));
			attempts++;
		} while (attempts < 50 && (
			isNearRiver(seedX, seedY, riverSet, 2) ||
			citySet.has(`${seedX},${seedY}`) ||
			townSet.has(`${seedX},${seedY}`) ||
			infrastructureSet.has(`${seedX},${seedY}`) ||
			isNearClusters(seedX, seedY, [...cityClusters, ...blobs], 3)
		));

		if (attempts >= 50) continue;

		const blob = [{ x: seedX, y: seedY }];
		const blobSize = 4 + Math.floor(Math.random() * 5);

		for (let j = 1; j < blobSize; j++) {
			const parent = blob[Math.floor(Math.random() * blob.length)];
			const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
			const shuffled = directions.sort(() => Math.random() - 0.5);

			for (const [dx, dy] of shuffled) {
				const nextX = parent.x + dx;
				const nextY = parent.y + dy;
				if (nextX > 0 && nextX < width - 1 && nextY > 0 && nextY < height - 1 &&
					!riverSet.has(`${nextX},${nextY}`) &&
					!citySet.has(`${nextX},${nextY}`) &&
					!townSet.has(`${nextX},${nextY}`) &&
					!infrastructureSet.has(`${nextX},${nextY}`) &&
					!blob.some(cell => cell.x === nextX && cell.y === nextY)) {
					blob.push({ x: nextX, y: nextY });
					break;
				}
			}
		}
		blobs.push(blob);
	}
	return blobs;
}
