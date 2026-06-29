import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLYPHS } from './Mojibake.js';
import { comboModelCache } from './ComboTiles.js';
import { instanceTemplates, billboardBaseNames } from './Instancing.js';
import { GRADIENT_PRESETS, toonGradientMap, applyMaterialShaderChain, isBillboardObject } from './ToonMaterials.js';
import { applyTileDepthFade } from './TileDepthFade.js';
import { applyWindSway, isWindSwayBushName, isWindSwayObjectName } from './WindSway.js';
import { createLiquidMaterial } from './WaterSystem.js';

const CELL_SIZE = 2;

// Cache: { Grass: [mesh1], RoadStraight: [mesh_v1, mesh_v2] }
export const tileModelCache = {};
export let tileModelsLoaded = false;

function parsePatternDimensions(patternType) {
	if (patternType.includes('x')) {
		const parts = patternType.split('x');
		const width = parseInt(parts[0], 10) || 1;
		const height = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
		return { width, height };
	}
	if (patternType.startsWith('seq')) {
		const length = parseInt(patternType.substring(3), 10) || 1;
		return { width: length, height: 1 };
	}
	return { width: 1, height: 1 };
}

function positionToEdge(pos, width, height) {
	const cellWidth = CELL_SIZE;
	const totalWidth = width * cellWidth;
	const totalHeight = height * cellWidth;

	// Convert from centered coordinates (Blender) to 0-based coordinates
	// Blender model is centered at origin, so x: [-totalWidth/2, +totalWidth/2]
	const offsetX = pos.x + totalWidth / 2;
	const offsetZ = pos.z + totalHeight / 2;

	// Epsilon tolerance for floating point errors
	const epsilon = 0.05;
	if (offsetX < -epsilon || offsetZ < -epsilon || offsetX > totalWidth + epsilon || offsetZ > totalHeight + epsilon) {
		return { cellIndex: -1, direction: null };
	}

	// Clamp to valid range (handles slight floating point overflow at boundaries)
	const clampedX = Math.max(0, Math.min(offsetX, totalWidth - 0.001));
	const clampedZ = Math.max(0, Math.min(offsetZ, totalHeight - 0.001));

	const cellX = Math.min(Math.floor(clampedX / cellWidth), width - 1);
	const cellY = Math.min(Math.floor(clampedZ / cellWidth), height - 1);
	const cellIndex = cellY * width + cellX;

	const localX = clampedX - cellX * cellWidth;
	const localZ = clampedZ - cellY * cellWidth;

	const edgeThreshold = cellWidth * 0.15;
	let direction = null;

	if (localZ < edgeThreshold) direction = 'N';
	else if (localZ > cellWidth - edgeThreshold) direction = 'S';
	else if (localX < edgeThreshold) direction = 'W';
	else if (localX > cellWidth - edgeThreshold) direction = 'E';

	return { cellIndex, direction };
}

function buildEdgeConstraintsFromMarkers(markers, patternType) {
	const { width, height } = parsePatternDimensions(patternType);

	const constraints = [];
	for (let i = 0; i < width * height; i++) {
		constraints.push({ N: null, E: null, S: null, W: null });
	}

	markers.forEach(marker => {
		const { cellIndex, direction } = positionToEdge(marker.position, width, height);
		if (cellIndex >= 0 && direction) {
			constraints[cellIndex][direction] = marker.type;
		}
	});

	return constraints;
}

// Shared material system
export let sharedAtlasMaterial; // Shared toon material for all atlas-based tiles
export let sharedLiquidMaterial; // Shared liquid material for all Liquid_ meshes
let waveQuadMaterial = null; // Material for wave quad effects
let waveQuadMesh = null; // Instanced mesh for wave quads
export let waveQuadModel = null; // Cached Wave_Quad mesh from GLB
let materials; // Pre-created reusable materials
// Vendored for the threejs-benchmark Landscape bench: the runtime assets the
// bench needs (Tiles.glb + Textures/) are committed under public/landscape/ so
// the bench deploys. Paths are absolute to the served public copy.
const VENDOR_ASSET_BASE = '/landscape/';
const REQUIRED_PROP_ATLAS_PATH = VENDOR_ASSET_BASE + 'Textures/Universal-Atlas.png';

function loadRequiredTexture(path) {
	return new Promise((resolve, reject) => {
		new THREE.TextureLoader().load(path, resolve, undefined, () => {
			reject(new Error(`Failed to load required texture: ${path}`));
		});
	});
}

function configurePropAtlasTexture(texture) {
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.flipY = false;
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
}

function applyPropAtlasToMaterial(material, texture) {
	if (Array.isArray(material)) {
		material.forEach(entry => applyPropAtlasToMaterial(entry, texture));
		return;
	}
	material.map = texture;
	material.needsUpdate = true;
}

export async function loadTileModels({ applyLandscapeMaterial, shouldLogCellInfo }) {
	const loader = new GLTFLoader();
	const propAtlasTexture = await loadRequiredTexture(REQUIRED_PROP_ATLAS_PATH);
	configurePropAtlasTexture(propAtlasTexture);
	return new Promise((resolve, reject) => {
		loader.load(VENDOR_ASSET_BASE + 'Tiles.glb', (gltf) => {
			// First pass: collect all tile-related objects (meshes and groups)
			// Key format: "BaseName" or "BaseName_v1" to separate variants
			const tileObjects = {};
			const comboObjects = {}; // For pattern tiles like Grass_Tile_2x2, RiverStraight_Tile_seq4
			const edgeMarkers = {};

			function findComboInfoForMarker(marker) {
				let current = marker.parent;
				while (current) {
					const patternMatch = current.name.match(/^(.+)_Tile_(\d+x\d*|seq\d+)(?:_(v\d+))?(?:_.+)?$/);
					if (patternMatch) {
						const tileName = patternMatch[1];
						const patternType = patternMatch[2];
						const variant = patternMatch[3] || null;
						const comboKey = `${tileName}_${patternType}`;
						const variantKey = variant ? `${comboKey}_${variant}` : comboKey;
						return { comboKey, variantKey, patternType, root: current };
					}
					current = current.parent;
				}
				return null;
			}

			gltf.scene.traverse((child) => {
				// DEBUG: Log all objects with names to see what we're working with
				if (shouldLogCellInfo() && child.name) {
					console.log(`Object: ${child.name} (type: ${child.type})`);
					console.log(`  Position: (${child.position.x.toFixed(3)}, ${child.position.y.toFixed(3)}, ${child.position.z.toFixed(3)})`);
					console.log(`  Rotation: (${(child.rotation.x * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}, ${(child.rotation.y * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}, ${(child.rotation.z * 180 / Math.PI).toFixed(1)}${GLYPHS.degree})`);
					console.log(`  Scale: (${child.scale.x.toFixed(3)}, ${child.scale.y.toFixed(3)}, ${child.scale.z.toFixed(3)})`);
					if (child.isMesh) {
						console.log(`  Geometry: ${child.geometry.uuid}`);
					}
					console.log('---');
				}

				// DEBUG: Log transforms for Blender duplicates (name.001, name.002 pattern)
				if (shouldLogCellInfo() && child.name && /\.\d{3}$/.test(child.name)) {
					console.log(`Blender duplicate: ${child.name}`);
					console.log(`  Position: (${child.position.x.toFixed(3)}, ${child.position.y.toFixed(3)}, ${child.position.z.toFixed(3)})`);
					console.log(`  Rotation: (${(child.rotation.x * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}, ${(child.rotation.y * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}, ${(child.rotation.z * 180 / Math.PI).toFixed(1)}${GLYPHS.degree})`);
					console.log(`  Scale: (${child.scale.x.toFixed(3)}, ${child.scale.y.toFixed(3)}, ${child.scale.z.toFixed(3)})`);
					if (child.isMesh) {
						console.log(`  Geometry: ${child.geometry.uuid}`);
					}
				}

				// Check for Wave_Quad mesh
				if (child.name === 'Wave_Quad') {
					waveQuadModel = child.clone();
					return; // Don't process as regular tile
				}

				if (child.isMesh && child.material) {
					applyPropAtlasToMaterial(child.material, propAtlasTexture);
				}

				const edgeMarkerMatch = child.name.match(/^MarkerEdge_(\w+?)(\d*)(?:\.\d+)?$/);
				if (edgeMarkerMatch) {
					// Strip trailing digits (Blender duplicate suffix becomes part of name in GLB)
					const edgeType = edgeMarkerMatch[1];
					const comboInfo = findComboInfoForMarker(child);
					if (comboInfo) {
						const markerWorldPos = new THREE.Vector3();
						child.getWorldPosition(markerWorldPos);
						const markerLocalPos = markerWorldPos.clone();
						comboInfo.root.worldToLocal(markerLocalPos);

						if (!edgeMarkers[comboInfo.variantKey]) edgeMarkers[comboInfo.variantKey] = [];
						edgeMarkers[comboInfo.variantKey].push({
							type: edgeType,
							position: markerLocalPos
						});
					} else {
						if (shouldLogCellInfo()) console.warn(`Edge marker ${child.name} is not under a combo tile group.`);
					}
					child.visible = false;
					return;
				}

				// Identify instanceable objects (Foliage_*, Decal_*, Billboard_*, BillboardUnlit_*, Building_*, Liquid_* patterns)
				const instanceMatch = child.name.match(/^(Foliage_\w+|Decal_\w+?|BillboardUnlit_\w+|Billboard_\w+|Building_\w+|Liquid_\w+)(\d{3,})?$/);
				if (instanceMatch && child.isMesh) {
					const baseName = instanceMatch[1]; // e.g., "Foliage_Tree" or "Decal_ForestGrass1st" or "Billboard_Bush"

					if (!instanceTemplates[baseName]) {
						// Store first occurrence as template
						instanceTemplates[baseName] = {
							geometry: child.geometry.clone(),
							material: child.material.clone(),
							localTransform: {
								position: child.position.clone(),
								quaternion: child.quaternion.clone(),
								scale: child.scale.clone()
							}
						};
						// Convert material to appropriate type with gradients
						const materialResult = applyLandscapeMaterial(child, {
							force: true
						});

						child.material = materialResult.material;
						child.castShadow = materialResult.castShadow;
						child.receiveShadow = materialResult.receiveShadow;

						// Apply gradient if needed
						if (materialResult.needsGradient) {
							applyMaterialShaderChain(child.material, materialResult.gradientPreset);
						}
						if (isWindSwayObjectName(baseName)) {
							applyWindSway(child.material, { isBush: isWindSwayBushName(baseName) });
						}

						instanceTemplates[baseName].material = child.material; // Don't clone - preserves onBeforeCompile hook
					}

					// Mark billboards for Y-axis rotation
					if (isBillboardObject(baseName)) {
						billboardBaseNames.add(baseName);
					}

					// Mark this child for removal from tile (will be instanced globally)
					child.userData.instanceable = true;
					child.userData.instanceBaseName = baseName;
				}

				// Check for combo/pattern tiles first: Grass_Tile_2x2, Grass_Tile_2x2_v1, RiverStraight_Tile_seq4, etc.
				const patternMatch = child.name.match(/^(.+)_Tile_(\d+x\d*|seq\d+)(?:_(v\d+))?(?:_.+)?$/);
				if (patternMatch) {
					const tileName = patternMatch[1];
					const patternType = patternMatch[2]; // e.g., "2x2", "seq4"
					const variant = patternMatch[3] || null; // e.g., "v1", "v2", or null

					const comboKey = `${tileName}_${patternType}`;
					const variantKey = variant ? `${comboKey}_${variant}` : comboKey;

					if (!comboObjects[variantKey]) {
						comboObjects[variantKey] = { tileName, patternType, variant, objects: [] };
					}
					comboObjects[variantKey].objects.push(child);
				} else {
					// Match regular tiles: Name_Tile or Name_Tile_v1 or Name_Tile_PartName or Name_Tile_v1_PartName
					const match = child.name.match(/^(.+)_Tile(?:_(v\d+))?(?:_.+)?$/);
					if (match) {
						const baseName = match[1];
						const variant = match[2] || null; // e.g., "v1", "v2", or null
						// Use a unique key that includes variant info
						const variantKey = variant ? `${baseName}__${variant}` : `${baseName}__base`;
						if (!tileObjects[variantKey]) {
							tileObjects[variantKey] = { baseName, variant, objects: [] };
						}
						tileObjects[variantKey].objects.push(child);
					}
				}
			});

			// Filter out children of already-collected parents to avoid duplicates
			Object.keys(tileObjects).forEach(key => {
				tileObjects[key].objects = tileObjects[key].objects.filter(obj => {
					// Keep object only if none of its ancestors are in the same collection
					let parent = obj.parent;
					while (parent) {
						if (tileObjects[key].objects.includes(parent)) return false;
						parent = parent.parent;
					}
					return true;
				});
			});

			// Second pass: group related objects (parts of same variant) and add to cache
			Object.keys(tileObjects).forEach(key => {
				const { baseName, objects } = tileObjects[key];

				if (objects.length === 1) {
					// Single object - use it directly
					const obj = objects[0];
					if (!tileModelCache[baseName]) tileModelCache[baseName] = [];
					tileModelCache[baseName].push(obj);
				} else if (objects.length > 1) {
					// Multiple objects (parts of same tile variant) - create a group to hold them
					const group = new THREE.Group();
					group.name = baseName + '_Tile_Group';

					objects.forEach(obj => {
						group.add(obj.clone());
					});

					if (!tileModelCache[baseName]) tileModelCache[baseName] = [];
					tileModelCache[baseName].push(group);
				}
			});

			// Third pass: process combo/pattern tiles
			Object.keys(comboObjects).forEach(key => {
				const { tileName, patternType, objects } = comboObjects[key];

				const comboKey = `${tileName}_${patternType}`;

				if (objects.length === 1) {
					// Single object - use it directly
					const obj = objects[0];
					if (!comboModelCache[comboKey]) comboModelCache[comboKey] = [];
					comboModelCache[comboKey].push({ key, model: obj });
				} else if (objects.length > 1) {
					// Multiple objects (parts of same combo variant) - create a group to hold them
					const group = new THREE.Group();
					group.name = tileName + '_Tile_' + patternType + '_Group';

					objects.forEach(obj => {
						group.add(obj.clone());
					});

					if (!comboModelCache[comboKey]) comboModelCache[comboKey] = [];
					comboModelCache[comboKey].push({ key, model: group });
				}
			});

			Object.keys(comboModelCache).forEach(comboKey => {
				comboModelCache[comboKey].forEach(entry => {
					if (!entry || !entry.key) return;
					if (!comboObjects[entry.key]) return;
					if (edgeMarkers[entry.key]) {
						const { patternType } = comboObjects[entry.key];
						entry.constraints = buildEdgeConstraintsFromMarkers(edgeMarkers[entry.key], patternType);
						const { width, height } = parsePatternDimensions(patternType);
						entry.width = width;
						entry.height = height;
						if (shouldLogCellInfo()) {
							console.log(`Edge constraints for ${entry.key}:`, JSON.stringify(entry.constraints));
							console.log(`  Markers:`, edgeMarkers[entry.key].map(m =>
								`${m.type} @ (${m.position.x.toFixed(2)}, ${m.position.z.toFixed(2)})`
							).join(', '));
						}
					}
				});
			});

			// Create shared base toon material for all atlas-based tiles
			// All models share the same texture atlas, so they can share the same material
			const firstModelName = Object.keys(tileModelCache)[0];
			if (firstModelName && tileModelCache[firstModelName].length > 0) {
				const firstModel = tileModelCache[firstModelName][0];

				// Find the first mesh with a material
				let baseMaterial = null;
				firstModel.traverse((child) => {
					if (child.isMesh && child.material && !baseMaterial) {
						baseMaterial = child.material;
					}
				});

				if (baseMaterial) {
					sharedAtlasMaterial = baseMaterial.clone();
					sharedAtlasMaterial.color.setHex(0xffffff); // Base white color, will be overridden by tile colors
					sharedAtlasMaterial.alphaTest = 0.5;  // Enable alpha cutout
					sharedAtlasMaterial.transparent = false;  // Use alphaTest, not transparency
					sharedAtlasMaterial.shadowSide = THREE.DoubleSide;

					applyMaterialShaderChain(sharedAtlasMaterial, GRADIENT_PRESETS.tiles);
					applyTileDepthFade(sharedAtlasMaterial);
				}

				// Initialize shared liquid material
				sharedLiquidMaterial = createLiquidMaterial({
					baseColor: new THREE.Color(0x20d3ee),
					map: baseMaterial.map,  // Use the same texture atlas as tiles
					gradientMap: toonGradientMap  // LandscapeGenerator's existing gradient map
				});
				applyMaterialShaderChain(sharedLiquidMaterial, GRADIENT_PRESETS.liquid);
			}

			tileModelsLoaded = true;
			if (shouldLogCellInfo()) {
				console.log('Tile models loaded:', Object.keys(tileModelCache));
				console.log('Combo models loaded:', Object.keys(comboModelCache));
			}
			resolve();
		}, undefined, reject);
	});
}
