import * as THREE from 'three';

export function createWaveQuadController(dependencies) {
	const {
		scene,
		gridWidth,
		cellSize,
		getWaveQuadModel,
		createWaveQuadMaterial,
		buildWaveQuadInstances
	} = dependencies;

	let waveQuadMesh = null;
	let waveQuadMaterial = null;
	let warnedMissingWaveQuadModel = false;
	let visible = true;

	function collectLiquidPositions(wfc) {
		const liquidPositions = [];
		wfc.grid.forEach((cell, i) => {
			if (cell.collapsed && cell.tile.name.includes('Water')) {
				const gridX = i % gridWidth;
				const gridZ = Math.floor(i / gridWidth);
				const worldX = gridX * cellSize;
				const worldZ = gridZ * cellSize;
				liquidPositions.push(new THREE.Vector3(worldX, 0, worldZ));
			}
		});
		return liquidPositions;
	}

	function getWaveQuadTexture() {
		const waveQuadModel = getWaveQuadModel();
		if (!waveQuadModel || !waveQuadModel.material) return null;

		const sourceMaterial = Array.isArray(waveQuadModel.material)
			? waveQuadModel.material[0]
			: waveQuadModel.material;
		const quadTexture = sourceMaterial.map || null;
		if (quadTexture) {
			quadTexture.generateMipmaps = false;
			quadTexture.minFilter = THREE.NearestFilter;
			quadTexture.magFilter = THREE.NearestFilter;
			quadTexture.needsUpdate = true;
		}
		return quadTexture;
	}

	function ensureMaterial() {
		if (!waveQuadMaterial) {
			waveQuadMaterial = createWaveQuadMaterial(getWaveQuadTexture());
		}
		return waveQuadMaterial;
	}

	function rebuild(wfc) {
		const waveQuadModel = getWaveQuadModel();
		if (!waveQuadModel || !waveQuadModel.geometry) {
			remove();
			if (!warnedMissingWaveQuadModel) {
				console.warn('[WAVE_QUADS] Wave_Quad model missing; water foam quads disabled');
				warnedMissingWaveQuadModel = true;
			}
			return;
		}

		const liquidPositions = collectLiquidPositions(wfc);
		if (liquidPositions.length === 0) {
			remove();
			return;
		}

		waveQuadMesh = buildWaveQuadInstances({
			liquidPositions,
			scene,
			waveQuadMaterial: ensureMaterial(),
			waveQuadModel,
			waterHeight: -0.12,
			cellSize,
			quadsPerTile: [18, 28],
			quadScale: 0.225,
			minQuadDistance: 0.25,
			existingMesh: { mesh: waveQuadMesh }
		});
		waveQuadMesh.visible = visible;
	}

	function setVisible(nextVisible) {
		visible = nextVisible;
		if (waveQuadMesh) waveQuadMesh.visible = visible;
	}

	function remove() {
		if (waveQuadMesh) {
			scene.remove(waveQuadMesh);
			waveQuadMesh = null;
		}
	}

	function dispose() {
		if (waveQuadMesh) {
			scene.remove(waveQuadMesh);
			if (typeof waveQuadMesh.dispose === 'function') waveQuadMesh.dispose();
			waveQuadMesh = null;
		}

		if (waveQuadMaterial) {
			waveQuadMaterial.dispose();
			waveQuadMaterial = null;
		}
	}

	function updateTime(time) {
		if (waveQuadMaterial && waveQuadMaterial.userData.waveUniforms) {
			waveQuadMaterial.userData.waveUniforms.uTime.value = time;
		}
	}

	return {
		rebuild,
		remove,
		dispose,
		updateTime,
		setVisible
	};
}
