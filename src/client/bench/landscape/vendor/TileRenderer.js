import * as THREE from 'three';
import { R, W, C, F, RV } from './TileDefs.js';
import { applyTileDepthFade } from './TileDepthFade.js';

const CHURCH_INSTANCE_BASE_NAME = 'Building_Church';
const MAX_CHURCH_INSTANCES = 2;

export function createTileRenderer(dependencies) {
	const {
		cellSize,
		tileModelCache,
		originalRandom,
		getUsePrimitiveShapes,
		convertToToonMaterial,
		collectedInstances
	} = dependencies;
	let churchInstanceCount = 0;

	function createTileMesh(tile, x = 0, z = 0, applyPosition = true, skipInstanceCollection = false) {
		const baseName = tile.name;
		const models = tileModelCache[baseName];

		if (getUsePrimitiveShapes()) {
			return createColoredPlaceholder(tile, x, z, applyPosition);
		}

		if (models && models.length > 0) {
			const selectableModels = skipInstanceCollection ? models : getSelectableModels(models);
			const model = selectableModels[Math.floor(originalRandom() * selectableModels.length)];
			if (!skipInstanceCollection) {
				churchInstanceCount += countChurchInstances(model);
			}
			const mesh = model.clone();

			mesh.traverse((child) => {
				if (child.isMesh && !child.userData.instanceable) {
					convertToToonMaterial(child, { force: false, alphaTest: 0.5, transparent: false });
					applyTileDepthFade(child.material);
				}
			});

			const tileWorldX = x;
			const tileWorldZ = z;
			const tileRotation = tile.rotation;

			mesh.updateMatrixWorld(true);

			const toRemove = [];
			if (!skipInstanceCollection) {
				mesh.traverse((child) => {
					if (child.userData.instanceable) {
						const instanceBaseName = child.userData.instanceBaseName;

						const localPosition = new THREE.Vector3();
						child.getWorldPosition(localPosition);

						const localQuaternion = new THREE.Quaternion();
						child.getWorldQuaternion(localQuaternion);
						const localScale = new THREE.Vector3();
						child.getWorldScale(localScale);

						const tileRotationQuaternion = new THREE.Quaternion();
						tileRotationQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -tileRotation * Math.PI / 2);

						localPosition.applyQuaternion(tileRotationQuaternion);

						const worldPosition = new THREE.Vector3(tileWorldX, 0, tileWorldZ);
						worldPosition.add(localPosition);

						const worldQuaternion = tileRotationQuaternion.clone();
						worldQuaternion.multiply(localQuaternion);

						const worldMatrix = new THREE.Matrix4();
						worldMatrix.compose(worldPosition, worldQuaternion, localScale);

						if (!collectedInstances[instanceBaseName]) collectedInstances[instanceBaseName] = [];
						collectedInstances[instanceBaseName].push({
							matrix: worldMatrix.clone(),
							tileX: x / cellSize,
							tileZ: z / cellSize
						});

						toRemove.push(child);
					}
				});

				toRemove.forEach(child => child.removeFromParent());
			}

			mesh.rotation.y = -tile.rotation * Math.PI / 2;
			if (applyPosition) {
				mesh.position.set(x, 0, z);
			}

			animateEntryScale(mesh);

			return mesh;
		}

		return createColoredPlaceholder(tile, x, z);
	}

	function getSelectableModels(models) {
		const remainingChurchInstances = MAX_CHURCH_INSTANCES - churchInstanceCount;
		if (remainingChurchInstances > 0) {
			const fittingModels = models.filter(model => countChurchInstances(model) <= remainingChurchInstances);
			if (fittingModels.length > 0) return fittingModels;
		}
		const nonChurchModels = models.filter(model => countChurchInstances(model) === 0);
		if (nonChurchModels.length === 0) return models;
		return nonChurchModels;
	}

	function resetPlacementLimits() {
		churchInstanceCount = 0;
	}

	function createColoredPlaceholder(tile, x = 0, z = 0, applyPosition = true) {
		const group = new THREE.Group();
		const size = cellSize;
		const height = 0.3;

		let baseColor = 0x4a7c4a;
		const edges = tile.edges;

		if (edges.every(edge => edge === W)) baseColor = 0x2b65ec;
		else if (edges.every(edge => edge === C)) baseColor = 0x8b4513;
		else if (edges.every(edge => edge === F)) baseColor = 0x2d5016;

		const baseGeometry = new THREE.BoxGeometry(size, height, size);
		const baseMaterial = new THREE.MeshStandardMaterial({ color: baseColor });
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.receiveShadow = true;
		group.add(base);

		{
			const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db, metalness: 0.1, roughness: 0.2 });
			edges.forEach((edge, i) => {
				if (edge === W) {
					const waterBox = new THREE.Mesh(new THREE.BoxGeometry(size / 2 + 0.1, 0.05, size / 2 + 0.1), waterMaterial);
					if (i === 0) waterBox.position.set(0, height / 2 + 0.01, -size / 4);
					if (i === 1) waterBox.position.set(size / 4, height / 2 + 0.01, 0);
					if (i === 2) waterBox.position.set(0, height / 2 + 0.01, size / 4);
					if (i === 3) waterBox.position.set(-size / 4, height / 2 + 0.01, 0);
					group.add(waterBox);
				}
			});
		}

		const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
		const roadWidth = 0.3;
		edges.forEach((edge, i) => {
			if (edge === R) {
				const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.07, size / 2 + 0.02), roadMaterial);
				if (i === 0) road.position.set(0, height / 2 + 0.02, -size / 4);
				if (i === 1) { road.position.set(size / 4, height / 2 + 0.02, 0); road.rotation.y = Math.PI / 2; }
				if (i === 2) road.position.set(0, height / 2 + 0.02, size / 4);
				if (i === 3) { road.position.set(-size / 4, height / 2 + 0.02, 0); road.rotation.y = Math.PI / 2; }
				group.add(road);
			}
		});
		if (edges.filter(edge => edge === R).length > 1) {
			const junction = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.07, roadWidth), roadMaterial);
			junction.position.y = height / 2 + 0.02;
			group.add(junction);
		}

		const riverMaterial = new THREE.MeshStandardMaterial({ color: 0x2980b9, metalness: 0.2, roughness: 0.3 });
		const riverWidth = 0.35;
		edges.forEach((edge, i) => {
			if (edge === RV) {
				const river = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 0.04, size / 2 + 0.02), riverMaterial);
				river.position.y = height / 2 + 0.01;
				if (i === 0) river.position.z = -size / 4;
				if (i === 1) { river.position.set(size / 4, height / 2 + 0.01, 0); river.rotation.y = Math.PI / 2; }
				if (i === 2) river.position.z = size / 4;
				if (i === 3) { river.position.set(-size / 4, height / 2 + 0.01, 0); river.rotation.y = Math.PI / 2; }
				group.add(river);
			}
		});
		if (edges.filter(edge => edge === RV).length > 1) {
			const junction = new THREE.Mesh(new THREE.BoxGeometry(riverWidth, 0.04, riverWidth), riverMaterial);
			junction.position.y = height / 2 + 0.01;
			group.add(junction);
		}

		const cityMaterial = new THREE.MeshStandardMaterial({ color: 0xd35400 });
		const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xc0392b });
		const cityTrapMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
		edges.forEach((edge, i) => {
			if (edge === C) {
				const buildingGroup = new THREE.Group();
				const body = new THREE.Mesh(new THREE.BoxGeometry(size / 2, 0.6, size / 2), cityMaterial);
				const roof = new THREE.Mesh(new THREE.ConeGeometry(size / 3, 0.4, 4), roofMaterial);
				roof.position.y = 0.5;
				roof.rotation.y = Math.PI / 4;
				buildingGroup.add(body, roof);

				buildingGroup.position.y = height / 2 + 0.3;
				if (i === 0) buildingGroup.position.z -= size / 4;
				if (i === 1) buildingGroup.position.x += size / 4;
				if (i === 2) buildingGroup.position.z += size / 4;
				if (i === 3) buildingGroup.position.x -= size / 4;
				group.add(buildingGroup);

				const trapezoidGeometry = createFlatTrapezoid(size, size * 0.4);
				const trapezoidMesh = new THREE.Mesh(trapezoidGeometry, cityTrapMaterial);

				trapezoidMesh.position.y = height / 2 + 0.01;

				if (i === 0) {
					trapezoidMesh.position.z = -size / 2;
					trapezoidMesh.rotation.y = 0;
				} else if (i === 1) {
					trapezoidMesh.position.x = size / 2;
					trapezoidMesh.rotation.y = -Math.PI / 2;
				} else if (i === 2) {
					trapezoidMesh.position.z = size / 2;
					trapezoidMesh.rotation.y = Math.PI;
				} else if (i === 3) {
					trapezoidMesh.position.x = -size / 2;
					trapezoidMesh.rotation.y = Math.PI / 2;
				}

				group.add(trapezoidMesh);
			}
		});

		const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
		const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 });
		const darkLeavesMaterial = new THREE.MeshStandardMaterial({ color: 0x1a6b1a });
		edges.forEach((edge, i) => {
			if (edge === F) {
				const treeGroup = new THREE.Group();

				const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6), trunkMaterial);
				trunk.position.y = 0.2;
				const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 6), leavesMaterial);
				leaves.position.y = 0.55;
				treeGroup.add(trunk, leaves);

				const secondTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6), trunkMaterial);
				secondTrunk.position.set(0.15, 0.125, 0.1);
				const secondLeaves = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 6), darkLeavesMaterial);
				secondLeaves.position.set(0.15, 0.38, 0.1);
				treeGroup.add(secondTrunk, secondLeaves);

				treeGroup.position.y = height / 2;
				if (i === 0) treeGroup.position.z -= size / 4;
				if (i === 1) { treeGroup.position.x += size / 4; treeGroup.rotation.y = Math.PI / 2; }
				if (i === 2) { treeGroup.position.z += size / 4; treeGroup.rotation.y = Math.PI; }
				if (i === 3) { treeGroup.position.x -= size / 4; treeGroup.rotation.y = -Math.PI / 2; }
				group.add(treeGroup);

				const trapezoidGeometry = createFlatTrapezoid(size, size * 0.4);
				const trapezoidMesh = new THREE.Mesh(trapezoidGeometry, darkLeavesMaterial);

				trapezoidMesh.position.y = height / 2 + 0.01;

				if (i === 0) {
					trapezoidMesh.position.z = -size / 2;
					trapezoidMesh.rotation.y = 0;
				} else if (i === 1) {
					trapezoidMesh.position.x = size / 2;
					trapezoidMesh.rotation.y = -Math.PI / 2;
				} else if (i === 2) {
					trapezoidMesh.position.z = size / 2;
					trapezoidMesh.rotation.y = Math.PI;
				} else if (i === 3) {
					trapezoidMesh.position.x = -size / 2;
					trapezoidMesh.rotation.y = Math.PI / 2;
				}

				group.add(trapezoidMesh);
			}
		});

		if (applyPosition) {
			group.position.set(x, 0, z);
		}

		animateEntryScale(group);

		return group;
	}

	return {
		createTileMesh,
		resetPlacementLimits
	};
}

function countChurchInstances(object) {
	let count = 0;
	object.traverse((child) => {
		if (child.userData.instanceBaseName === CHURCH_INSTANCE_BASE_NAME) {
			count++;
		}
	});
	return count;
}

function animateEntryScale(object) {
	object.scale.set(0, 0, 0);
	new Promise(resolve => {
		let scale = 0;
		const animate = () => {
			scale += 0.1;
			if (scale >= 1) {
				object.scale.set(1, 1, 1);
				return;
			}
			object.scale.set(scale, scale, scale);
			requestAnimationFrame(animate);
		};
		animate();
	});
}

function createFlatTrapezoid(edgeWidth, depth) {
	const geometry = new THREE.BufferGeometry();

	const vertices = new Float32Array([
		-edgeWidth / 2, 0, 0,
		edgeWidth / 2, 0, 0,
		edgeWidth / 6, 0, depth,
		-edgeWidth / 6, 0, depth,
	]);

	const indices = new Uint16Array([
		0, 2, 1,
		0, 3, 2
	]);

	geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
	geometry.setIndex(new THREE.BufferAttribute(indices, 1));
	geometry.computeVertexNormals();

	return geometry;
}
