import * as THREE from 'three';
import { createWindDepthMaterial, isWindSwayBushName, isWindSwayObjectName } from './WindSway.js';

export const instanceTemplates = {};
export const collectedInstances = {};
export const instancedMeshes = {};
export const instanceTracking = {};
export const hiddenInstanceMatrices = {};
export const billboardBaseNames = new Set();
export const comboBillboardMeshes = [];

const billboardMatrix = new THREE.Matrix4();
const billboardPosition = new THREE.Vector3();
const billboardQuaternion = new THREE.Quaternion();
const billboardScale = new THREE.Vector3();
const billboardUpAxis = new THREE.Vector3(0, 1, 0);
const comboBillboardWorldPosition = new THREE.Vector3();
const comboBillboardParentQuaternion = new THREE.Quaternion();
const comboBillboardParentEuler = new THREE.Euler();
const lastBillboardCameraPosition = new THREE.Vector3();
let billboardsNeedUpdate = true;

export function invalidateBillboardRotations() {
	billboardsNeedUpdate = true;
}

export function createInstancedMeshes({ scene, shadowsEnabled, isBillboardObject }) {
	Object.entries(collectedInstances).forEach(([baseName, instances]) => {
		if (instances.length === 0) return;

		const template = instanceTemplates[baseName];
		const instancedMesh = new THREE.InstancedMesh(
			template.geometry,
			template.material,
			instances.length
		);

		instances.forEach((instance, i) => {
			instancedMesh.setMatrixAt(i, instance.matrix);
		});
		instancedMesh.instanceMatrix.needsUpdate = true;

		const isDecal = baseName.includes('Decal_');
		const isBillboard = isBillboardObject(baseName);
		const isLiquid = baseName.includes('Liquid_');
		instancedMesh.castShadow = shadowsEnabled && !isDecal && !isBillboard && !isLiquid;
		instancedMesh.receiveShadow = shadowsEnabled;
		// GrassBright tufts read better without AO (their alpha-cut fronds otherwise
		// pick up muddy self-occlusion); keep them out of the GTAO G-buffer.
		if (baseName.includes('GrassBright')) {
			instancedMesh.userData.skipGTAO = true;
		}
		if (instancedMesh.castShadow && isWindSwayObjectName(baseName)) {
			instancedMesh.customDepthMaterial = createWindDepthMaterial(template.material, { isBush: isWindSwayBushName(baseName) });
		}

		instancedMeshes[baseName] = instancedMesh;
		instanceTracking[baseName] = instances.map((instance, i) => ({
			instanceIndex: i,
			matrix: instance.matrix,
			tileX: instance.tileX,
			tileZ: instance.tileZ
		}));

		scene.add(instancedMesh);
	});
	invalidateBillboardRotations();
}

export function clearInstancedMeshes({ scene }) {
	Object.values(instancedMeshes).forEach(mesh => {
		scene.remove(mesh);
		mesh.geometry.dispose();
		if (mesh.material.dispose) mesh.material.dispose();
		if (mesh.customDepthMaterial?.dispose) mesh.customDepthMaterial.dispose();
	});

	for (const key in instancedMeshes) delete instancedMeshes[key];
	for (const key in collectedInstances) delete collectedInstances[key];
	for (const key in instanceTracking) delete instanceTracking[key];
	for (const key in hiddenInstanceMatrices) delete hiddenInstanceMatrices[key];
	invalidateBillboardRotations();
}

export function hideInstancedMeshes() {
	Object.values(instancedMeshes).forEach(mesh => {
		mesh.visible = false;
	});
}

export function showInstancedMeshes() {
	Object.values(instancedMeshes).forEach(mesh => {
		mesh.visible = true;
	});
}

export function hideInstancesForPattern(pattern, iteratePatternCells) {
	iteratePatternCells(pattern, (cx, cy) => {
		Object.entries(instanceTracking).forEach(([baseName, tracking]) => {
			const mesh = instancedMeshes[baseName];
			if (!mesh) return;

			tracking.forEach(({ instanceIndex, tileX, tileZ }) => {
				if (Math.floor(tileX) === cx && Math.floor(tileZ) === cy) {
					if (!hiddenInstanceMatrices[baseName]) {
						hiddenInstanceMatrices[baseName] = {};
					}

					if (!hiddenInstanceMatrices[baseName][instanceIndex]) {
						const originalMatrix = new THREE.Matrix4();
						mesh.getMatrixAt(instanceIndex, originalMatrix);
						hiddenInstanceMatrices[baseName][instanceIndex] = originalMatrix.clone();

						const hiddenMatrix = originalMatrix.clone();
						const scale = new THREE.Vector3();
						const position = new THREE.Vector3();
						const quaternion = new THREE.Quaternion();
						hiddenMatrix.decompose(position, quaternion, scale);
						scale.set(0, 0, 0);
						hiddenMatrix.compose(position, quaternion, scale);
						mesh.setMatrixAt(instanceIndex, hiddenMatrix);
					}
				}
			});
		});
	});

	Object.keys(instanceTracking).forEach(baseName => {
		if (hiddenInstanceMatrices[baseName] && Object.keys(hiddenInstanceMatrices[baseName]).length > 0) {
			instancedMeshes[baseName].instanceMatrix.needsUpdate = true;
		}
	});
}

export function showInstancesForPattern(pattern, iteratePatternCells) {
	iteratePatternCells(pattern, (cx, cy) => {
		Object.entries(instanceTracking).forEach(([baseName, tracking]) => {
			const mesh = instancedMeshes[baseName];
			if (!mesh) return;

			tracking.forEach(({ instanceIndex, tileX, tileZ }) => {
				if (Math.floor(tileX) === cx && Math.floor(tileZ) === cy) {
					if (hiddenInstanceMatrices[baseName] && hiddenInstanceMatrices[baseName][instanceIndex]) {
						const originalMatrix = hiddenInstanceMatrices[baseName][instanceIndex];
						mesh.setMatrixAt(instanceIndex, originalMatrix);
						delete hiddenInstanceMatrices[baseName][instanceIndex];
					}
				}
			});

			if (hiddenInstanceMatrices[baseName] && Object.keys(hiddenInstanceMatrices[baseName]).length === 0) {
				delete hiddenInstanceMatrices[baseName];
			}
		});
	});

	Object.keys(instanceTracking).forEach(baseName => {
		if (instancedMeshes[baseName]) {
			instancedMeshes[baseName].instanceMatrix.needsUpdate = true;
		}
	});
}

export function updateBillboards({ cameraMode, currentView, orthoCamera, camera }) {
	if (billboardBaseNames.size === 0) return;

	const activeCamera = cameraMode === 'orthographic' && currentView === 'pieces' ? orthoCamera : camera;
	const cameraPosition = activeCamera.position;
	if (!billboardsNeedUpdate && lastBillboardCameraPosition.equals(cameraPosition)) return;

	billboardBaseNames.forEach(baseName => {
		const mesh = instancedMeshes[baseName];
		const tracking = instanceTracking[baseName];
		if (!mesh || !tracking) return;

		tracking.forEach(({ instanceIndex }) => {
			if (hiddenInstanceMatrices[baseName]?.[instanceIndex]) return;

			mesh.getMatrixAt(instanceIndex, billboardMatrix);
			billboardMatrix.decompose(billboardPosition, billboardQuaternion, billboardScale);

			const angle = Math.atan2(cameraPosition.x - billboardPosition.x, cameraPosition.z - billboardPosition.z);
			billboardQuaternion.setFromAxisAngle(billboardUpAxis, angle);

			billboardMatrix.compose(billboardPosition, billboardQuaternion, billboardScale);
			mesh.setMatrixAt(instanceIndex, billboardMatrix);
		});

		mesh.instanceMatrix.needsUpdate = true;
	});

	comboBillboardMeshes.forEach(mesh => {
		if (!mesh.parent) return;
		mesh.getWorldPosition(comboBillboardWorldPosition);
		const angle = Math.atan2(cameraPosition.x - comboBillboardWorldPosition.x, cameraPosition.z - comboBillboardWorldPosition.z);

		mesh.parent.getWorldQuaternion(comboBillboardParentQuaternion);
		comboBillboardParentEuler.setFromQuaternion(comboBillboardParentQuaternion, 'YXZ');

		mesh.rotation.y = angle - comboBillboardParentEuler.y;
	});

	lastBillboardCameraPosition.copy(cameraPosition);
	billboardsNeedUpdate = false;
}

export function destroyInstance(baseName, instanceIndex) {
	const mesh = instancedMeshes[baseName];
	const tracking = instanceTracking[baseName];
	if (!mesh || !tracking || instanceIndex >= tracking.length) return null;

	const lastIndex = tracking.length - 1;
	const destroyedData = tracking[instanceIndex];

	if (instanceIndex < lastIndex) {
		const lastMatrix = new THREE.Matrix4();
		mesh.getMatrixAt(lastIndex, lastMatrix);
		mesh.setMatrixAt(instanceIndex, lastMatrix);

		tracking[instanceIndex] = tracking[lastIndex];
		tracking[instanceIndex].instanceIndex = instanceIndex;
	}

	tracking.pop();
	mesh.count = tracking.length;
	mesh.instanceMatrix.needsUpdate = true;

	return destroyedData;
}
