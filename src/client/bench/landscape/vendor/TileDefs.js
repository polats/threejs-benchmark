export const G = 'GRASS';
export const R = 'ROAD';
export const W = 'WATER';
export const C = 'CITY';
export const F = 'FOREST';
export const RV = 'RIVER';

export const TILE_DEFS = [
	{ name: 'Grass', edges: [G, G, G, G], weight: 25 },
	{ name: 'Water', edges: [W, W, W, W], weight: 3 },
	{ name: 'City', edges: [C, C, C, C], weight: 2 },
	{ name: 'RoadStraight', edges: [G, R, G, R], weight: 4 },
	{ name: 'RoadCorner', edges: [G, R, R, G], weight: 4 },
	{ name: 'RoadT', edges: [G, R, R, R], weight: 20 },
	{ name: 'RoadCross', edges: [R, R, R, R], weight: 5 },
	{ name: 'RoadEnd', edges: [G, G, G, R], weight: 1 },
	{ name: 'RoadCityEnd', edges: [C, R, G, R], weight: 3 },
	{ name: 'RoadCitySide', edges: [C, C, R, G], weight: 2 },
	{ name: 'RoadCityCross', edges: [C, R, R, R], weight: 1 },
	{ name: 'GrassWaterEdge', edges: [W, G, G, G], weight: 4 },
	{ name: 'GrassWaterSide', edges: [W, W, G, G], weight: 4 },
	{ name: 'GrassWaterStraight', edges: [W, G, W, G], weight: 4 },
	{ name: 'GrassWaterT', edges: [W, W, W, G], weight: 2 },
	{ name: 'CitySide', edges: [C, G, G, G], weight: 4 },
	{ name: 'CityCorner', edges: [C, C, G, G], weight: 3 },
	{ name: 'CityStraight', edges: [C, G, C, G], weight: 3 },
	{ name: 'CityT', edges: [C, C, C, G], weight: 2 },
	{ name: 'RoadCity', edges: [C, G, R, G], weight: 2 },
	{ name: 'Bridge', edges: [W, R, W, R], weight: 1 },
	{ name: 'Forest', edges: [F, F, F, F], weight: 8 },
	{ name: 'ForestEdge', edges: [F, G, G, G], weight: 5 },
	{ name: 'ForestCorner', edges: [F, F, G, G], weight: 4 },
	{ name: 'ForestStraight', edges: [F, G, F, G], weight: 3 },
	{ name: 'ForestT', edges: [F, F, F, G], weight: 2 },
	{ name: 'RiverStraight', edges: [G, RV, G, RV], weight: 5 },
	{ name: 'RiverCorner', edges: [G, RV, RV, G], weight: 4 },
	{ name: 'RiverT', edges: [G, RV, RV, RV], weight: 20 },
	{ name: 'RiverCross', edges: [RV, RV, RV, RV], weight: 5 },
	{ name: 'RiverEnd', edges: [G, G, G, RV], weight: 1 },
	{ name: 'RiverLake', edges: [W, RV, W, RV], weight: 2 },
	{ name: 'RiverBridge', edges: [RV, R, RV, R], weight: 1 },
	{ name: 'ForestWaterEdge', edges: [W, F, F, F], weight: 2 },
	{ name: 'ForestWaterCorner', edges: [W, W, F, F], weight: 2 },
	{ name: 'ForestCity', edges: [F, C, F, C], weight: 1 },
	{ name: 'ForestCityEdge', edges: [C, F, F, F], weight: 2 },
	{ name: 'ForestCityGrassE', edges: [C, G, F, F], weight: 2 },
	{ name: 'ForestCityGrassS', edges: [C, F, G, F], weight: 2 },
	{ name: 'ForestCityGrassW', edges: [C, F, F, G], weight: 2 },
	{ name: 'RiverWaterEdge', edges: [W, RV, W, W], weight: 2 },
	{ name: 'RiverForest', edges: [F, RV, F, RV], weight: 2 },
	{ name: 'RoadWaterEdge', edges: [W, R, G, G], weight: 2 }
];

export class Tile {
	constructor(id, edges, rotation, name) {
		this.id = id;
		this.edges = edges;
		this.rotation = rotation;
		this.name = name;
	}
}

export const ALL_TILES = [];

TILE_DEFS.forEach((tileDef) => {
	const seen = new Set();
	for (let rotation = 0; rotation < 4; rotation++) {
		const rotatedEdges = [...tileDef.edges];
		for (let i = 0; i < rotation; i++) {
			const last = rotatedEdges.pop();
			rotatedEdges.unshift(last);
		}
		const key = rotatedEdges.join(',');
		if (!seen.has(key)) {
			ALL_TILES.push(new Tile(ALL_TILES.length, rotatedEdges, rotation, tileDef.name));
			seen.add(key);
		}
	}
});
