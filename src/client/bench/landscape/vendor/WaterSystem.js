// WaterSystem.js - Water and liquid material creation utilities

import * as THREE from 'three';

// Create animated liquid material with waves and reflections
export function createLiquidMaterial(options = {}) {
	const {
		baseColor = new THREE.Color(0x20d3ee),
		deepColor = new THREE.Color(0x20d3ee),
		fresnelColor = new THREE.Color(0x90caf9),
		opacity = 0.9,
		waveSpeed = 0.5,
		waveScale = 0.08,
		tiling = 0.25,
		map = null,
		reflectionMap = null,
		gradientMap = null
	} = options;

	const material = new THREE.MeshToonMaterial({
		color: baseColor,
		map: map,
		transparent: true,
		opacity: opacity,
		side: THREE.FrontSide,  // Enable backface culling
		gradientMap: gradientMap || getSharedGradientMap()
	});

	// Store reflection texture reference
	if (reflectionMap) {
		material.userData.reflectionMap = reflectionMap;
	}

	material.onBeforeCompile = (shader) => {
		// Add uniforms
		shader.uniforms.uTime = { value: 0 };
		shader.uniforms.uWaveSpeed = { value: waveSpeed };
		shader.uniforms.uWaveScale = { value: waveScale };
		shader.uniforms.uWaterTiling = { value: tiling };
		shader.uniforms.uDeepColor = { value: deepColor };
		shader.uniforms.uFresnelColor = { value: fresnelColor };
		shader.uniforms.uLevelMin = { value: new THREE.Vector2(0, 0) };
		shader.uniforms.uLevelSize = { value: new THREE.Vector2(24, 20) };
		if (reflectionMap) {
			shader.uniforms.tReflection = { value: reflectionMap };
		}

		// Store reference for animation
		material.userData.liquidUniforms = shader.uniforms;

		// Vertex shader modifications
		shader.vertexShader = shader.vertexShader.replace(
			'#include <common>',
			`
			#include <common>
			uniform float uTime;
			uniform float uWaveSpeed;
			uniform float uWaveScale;
			uniform float uWaterTiling;
			uniform vec2 uLevelMin;
			uniform vec2 uLevelSize;
			varying vec2 vWorldUV;
			varying vec3 vWorldNormal;
			varying vec3 vViewDir;
			varying float vWaveHeight;

			vec3 safeLiquidNormalize(vec3 value) {
				return value * inversesqrt(max(dot(value, value), 0.000001));
			}
			`
		);

		shader.vertexShader = shader.vertexShader.replace(
			'#include <worldpos_vertex>',
			`
			#include <worldpos_vertex>

			vec4 liquidWorldPos = vec4(transformed, 1.0);
			#ifdef USE_INSTANCING
				liquidWorldPos = instanceMatrix * liquidWorldPos;
			#endif
			liquidWorldPos = modelMatrix * liquidWorldPos;

			// Animated wave displacement
			float wave1 = sin(liquidWorldPos.x * 2.0 + uTime * uWaveSpeed) * 0.5;
			float wave2 = sin(liquidWorldPos.z * 1.5 + uTime * uWaveSpeed * 0.7) * 0.5;
			float wave3 = sin((liquidWorldPos.x + liquidWorldPos.z) * 1.2 + uTime * uWaveSpeed * 1.3) * 0.3;
			vWaveHeight = (wave1 + wave2 + wave3) * uWaveScale;

			// Create camera-responsive UV coordinates for reflection
			// This makes the reflection appear to move with camera position
			vec3 cameraToSurface = cameraPosition - liquidWorldPos.xyz;
			vec2 reflectionUV = liquidWorldPos.xz + cameraToSurface.xz * 0.1; // Camera influence

			vWorldUV = (reflectionUV - uLevelMin) / max(abs(uLevelSize), vec2(0.000001));

			vWorldNormal = safeLiquidNormalize(normalMatrix * normal);
			vViewDir = safeLiquidNormalize(cameraToSurface);
			`
		);

		// Fragment shader modifications
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <common>',
			`
			#include <common>
			uniform float uTime;
			uniform vec3 uDeepColor;
			uniform vec3 uFresnelColor;
			${reflectionMap ? 'uniform sampler2D tReflection;' : ''}
			varying vec2 vWorldUV;
			varying vec3 vWorldNormal;
			varying vec3 vViewDir;
			varying float vWaveHeight;
			`
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <color_fragment>',
			`
			#include <color_fragment>

			// Fresnel effect - more reflection at glancing angles
			float fresnel = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), 3.0);

			vec3 reflectionRgb = uFresnelColor;
			${reflectionMap ? `
			// Sample reflection texture with slight distortion from waves
			vec2 distortedUV = vWorldUV + vWorldNormal.xz * vWaveHeight * 0.02;
			vec4 reflectionColor = texture2D(tReflection, distortedUV);
			reflectionRgb = reflectionColor.rgb;
			` : ''}

			// Wave-based color variation
			float waveColorFactor = vWaveHeight * 5.0 + 0.5;

			// Dynamic reflection intensity based on viewing angle and waves
			float reflectionIntensity = 0.4 + fresnel * 0.4 + abs(vWaveHeight) * 0.2;

			// Mix colors based on fresnel, waves, and reflection
			diffuseColor.rgb = mix(diffuseColor.rgb, uDeepColor, 0.3 + waveColorFactor * 0.1);
			diffuseColor.rgb = mix(diffuseColor.rgb, reflectionRgb, reflectionIntensity);
			diffuseColor.rgb = mix(diffuseColor.rgb, uFresnelColor, fresnel * 0.6);
			`
		);
	};

	return material;
}

// Create animated wave quad material for water surfaces.
// Single-colour additive white foam — no texture, no UV sampling (the atlas region
// the quads used was a tiny opaque patch, so fighting its UVs was pointless).
// `texture` arg is accepted for backward compatibility but ignored.
export function createWaveQuadMaterial(texture) { // eslint-disable-line no-unused-vars
	const uniforms = {
		uTime: { value: 0 }
	};

	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		depthTest: true,            // occluded by terrain in front; still draws over the water surface (quads sit just above it)
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		vertexShader: `
			attribute float aPhase;
			attribute float aBaseOpacity;
			uniform float uTime;
			varying float vPhase;
			varying float vBaseOpacity;

			void main() {
				// Gentle per-quad breathing of size.
				float scale = 0.4 + 0.6 * (sin(uTime * 2.0 + aPhase) * 0.5 + 0.5);
				vec3 pos = position;
				pos.xy *= scale;
				vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
				gl_Position = projectionMatrix * modelViewMatrix * worldPos;

				vPhase = aPhase;
				vBaseOpacity = aBaseOpacity;
			}
		`,
		fragmentShader: `
			uniform float uTime;
			varying float vPhase;
			varying float vBaseOpacity;

			void main() {
				// Animated opacity (sine, clamped) x per-instance base opacity.
				float animatedOpacity = max(0.0, sin(uTime * 1.5 + vPhase));
				float opacity = animatedOpacity * vBaseOpacity;
				// Additive white: contribution = rgb * alpha. White sparkle on the water.
				gl_FragColor = vec4(vec3(1.0), opacity);
			}
		`,
		uniforms: uniforms
	});

	// Store reference for animation
	material.userData.waveUniforms = material.uniforms;

	return material;
}

// Build wave quad instances for water surfaces
export function buildWaveQuadInstances(options = {}) {
	const {
		liquidPositions,        // Array of {x, z} positions (simple format)
		liquidInstanceData,     // Instance data object
		scene,                  // THREE.Scene to add mesh to
		waveQuadMaterial,       // Pre-created material (optional)
		texture,                // Texture for material creation (optional)
		waveQuadModel,          // GLB model for geometry (optional)
		gridToWorldCenter,      // Function to convert grid coords (optional)
		cellSize = 1,           // Cell size for placement bounds (optional)
		minQuadDistance = 0.8,  // Minimum distance between quads
		maxQuadsPerPosition = 30, // Max quads per position (upper bound for buffer sizing)
		quadsPerTile = null,    // [min, max] quads per tile; default keeps legacy 6-10
		quadScale = 1,          // Uniform size multiplier for each quad (smaller = finer foam)
		waterHeight = -0.27     // Water surface height (Y coordinate)
	} = options;

	// Dispose existing wave quad mesh if provided
	if (options.existingMesh) {
		if (options.existingMesh.mesh) {
			if (scene) scene.remove(options.existingMesh.mesh);
			if (options.existingMesh.mesh.dispose) {
				options.existingMesh.mesh.dispose();
			}
			options.existingMesh.mesh = null;
		}
	}

	// Create material if not provided
	let material = waveQuadMaterial;
	if (!material) {
		// Extract texture from Wave_Quad mesh if available
		let quadTexture = texture;
		if (!quadTexture && waveQuadModel && waveQuadModel.material) {
			const sourceMat = Array.isArray(waveQuadModel.material)
				? waveQuadModel.material[0]
				: waveQuadModel.material;
			quadTexture = sourceMat?.map || null;
		}
		material = createWaveQuadMaterial(quadTexture);
	}

	// Collect liquid tile positions from either format
	let positions = [];
	if (liquidPositions) {
		// Simple format: array of {x, z} positions
		positions = liquidPositions.map(pos => ({
			x: pos.x,
			z: pos.z,
			matrix: null // Not needed for simple format
		}));
	} else if (liquidInstanceData) {
		// Extract from instance data (Map or plain object)
		const forEachEntry = (callback) => {
			if (liquidInstanceData instanceof Map) {
				liquidInstanceData.forEach((data, geometryKey) => callback(geometryKey, data));
			} else {
				Object.entries(liquidInstanceData).forEach(([geometryKey, data]) => callback(geometryKey, data));
			}
		};

		forEachEntry((geometryKey, data) => {
			if (geometryKey.includes('_Liquid')) {
				data.instances.forEach(instance => {
					positions.push({
						x: instance.gridX,
						z: instance.gridZ,
						matrix: instance.matrix
					});
				});
			}
		});
	}

	if (positions.length === 0) return;

	// Use Wave_Quad mesh from GLB
	let quadGeometry = waveQuadModel.geometry;

	// Estimate max possible instances (will be trimmed later)
	const maxInstanceCount = positions.length * maxQuadsPerPosition;

	// Create instanced buffer geometry
	const instancedGeometry = new THREE.InstancedBufferGeometry().copy(quadGeometry);

	// Create phase attributes for animation variation (will be trimmed)
	const phases = new Float32Array(maxInstanceCount);
	const baseOpacities = new Float32Array(maxInstanceCount);
	const matrices = new Float32Array(maxInstanceCount * 16);

	let instanceIndex = 0;

	positions.forEach(pos => {
		let worldX = pos.x;
		let worldZ = pos.z;

		// Convert grid coordinates if converter provided
		if (gridToWorldCenter) {
			const worldCoords = gridToWorldCenter(pos.x, pos.z);
			worldX = worldCoords.x;
			worldZ = worldCoords.z;
		}

		// Always use collision avoidance placement
		const placedPositions = [];

		// Quads per tile: default legacy 6-10, or [min,max] via quadsPerTile option.
		const qMin = quadsPerTile ? quadsPerTile[0] : 6;
		const qMax = quadsPerTile ? quadsPerTile[1] : 10;
		const targetQuadCount = Math.min(
			maxQuadsPerPosition,
			qMin + Math.floor(seededRandom() * (qMax - qMin + 1))
		);
		let placedCount = 0;
		let attempts = 0;
		const maxAttempts = targetQuadCount * 10; // Allow multiple attempts per quad

		while (placedCount < targetQuadCount && attempts < maxAttempts) {
			// Random position within tile bounds
			const offsetX = (seededRandom() - 0.5) * (cellSize * 0.8);
			const offsetZ = (seededRandom() - 0.5) * (cellSize * 0.8);

			// Check distance from already placed quads
			let tooClose = false;
			for (const placed of placedPositions) {
				const distance = Math.sqrt(
					(offsetX - placed.x) ** 2 +
					(offsetZ - placed.z) ** 2
				);
				if (distance < minQuadDistance) {
					tooClose = true;
					break;
				}
			}

			if (!tooClose) {
				// Place the quad
				placedPositions.push({ x: offsetX, z: offsetZ });

				// Create transform matrix for this quad (uniform scale + translation)
				const matrix = new THREE.Matrix4();
				matrix.makeScale(quadScale, quadScale, quadScale);
				matrix.setPosition(worldX + offsetX, waterHeight, worldZ + offsetZ);

				// Copy matrix to buffer
				matrix.toArray(matrices, instanceIndex * 16);

				// Random phase for animation offset
				phases[instanceIndex] = seededRandom() * Math.PI * 2;

				// Random base opacity between 0.2 and 1.0
				baseOpacities[instanceIndex] = 0.2 + seededRandom() * 0.8;

				instanceIndex++;
				placedCount++;
			}

			attempts++;
		}
	});

	// Trim arrays to actual instance count and set attributes
	const finalMatrices = matrices.slice(0, instanceIndex * 16);
	const finalPhases = phases.slice(0, instanceIndex);
	const finalBaseOpacities = baseOpacities.slice(0, instanceIndex);

	instancedGeometry.setAttribute('instanceMatrix', new THREE.InstancedBufferAttribute(finalMatrices, 16));
	instancedGeometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(finalPhases, 1));
	instancedGeometry.setAttribute('aBaseOpacity', new THREE.InstancedBufferAttribute(finalBaseOpacities, 1));

	// Create instanced mesh with actual instance count
	const waveQuadMesh = new THREE.InstancedMesh(instancedGeometry, material, instanceIndex);
	waveQuadMesh.frustumCulled = false;
	waveQuadMesh.renderOrder = 999; // Render after opaque geometry
	waveQuadMesh.castShadow = false;
	waveQuadMesh.receiveShadow = false;

	// Store reference if provided
	if (options.existingMesh) {
		options.existingMesh.mesh = waveQuadMesh;
	}

	// Add to scene
	if (scene) {
		scene.add(waveQuadMesh);
	}

	return waveQuadMesh;
}

// Seeded random function for deterministic placement
let seedRNG = null;
let currentSeed = null;
const originalRandom = Math.random;

function seededRandom() {
	if (seedRNG === null) {
		currentSeed = Math.floor(originalRandom() * 0xFFFFFFFF);
		seedRNG = currentSeed;
	}
	seedRNG = (seedRNG + 0x6D2B79F5) | 0;
	let t = Math.imul(seedRNG ^ (seedRNG >>> 15), seedRNG | 1);
	t = t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
