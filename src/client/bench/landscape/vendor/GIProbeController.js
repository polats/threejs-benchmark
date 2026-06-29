import * as THREE from 'three';
import { LightProbeGrid } from 'three/addons/lighting/LightProbeGrid.js';
import { LightProbeGridHelper } from 'three/addons/helpers/LightProbeGridHelper.js';

const PROBE_VOLUME_PADDING = 4;
const PROBE_VOLUME_HEIGHT = 1.2;
const PROBE_VOLUME_Y = 0.95;
const BAKE_CLOUD_Y = 2.2;
const BAKE_CLOUD_REPEAT = 2.5;
const BAKE_CLOUD_OPACITY = 0.72;
const BAKE_CLOUD_EDGE_FADE = 0.16;
const HELPER_SPHERE_SIZE = 0.08;
const HELPER_BRIGHTNESS = 0.16;
const PROBE_COUNTS = {
	width: 12,
	height: 2,
	depth: 10
};
const BAKE_OPTIONS = {
	cubemapSize: 8,
	bounces: 1,
	near: 0.05,
	far: 60
};

export function createGIProbeController(dependencies) {
	const {
		scene,
		renderer,
		gridWidth,
		gridHeight,
		cellSize,
		updateHint
	} = dependencies;

	let enabled = false;
	let helperVisible = false;
	let grid = null;
let helper = null;
let cloudTexture = null;
let bakeScheduled = false;
let contributionVisible = false;
let contributionMaterial = null;
let hiddenForContribution = [];

	function updateVisibilityHint(hintId, label, visible) {
		const statusText = `${label} ${visible ? 'on' : 'off'}`;
		const statusColor = visible ? '#4ecdc4' : '#ff6b6b';
		updateHint(hintId, statusText, statusColor);
	}

	function updateHints() {
		updateVisibilityHint('gi-probes-hint', 'GI probes', enabled);
		updateVisibilityHint('gi-probe-helper-hint', 'GI helper', helperVisible);
		updateVisibilityHint('gi-contribution-hint', 'GI contribution', contributionVisible);
	}

	function disposeHelper() {
		if (!helper) return;
		scene.remove(helper);
		helper.dispose();
		helper = null;
	}

	function disposeGrid() {
		clearContributionOverride();
		disposeHelper();
		if (!grid) return;
		scene.remove(grid);
		grid.dispose();
		grid = null;
	}

	function createContributionMaterial() {
		if (!grid) return null;
		const material = new THREE.ShaderMaterial({
			glslVersion: THREE.GLSL3,
			uniforms: {
				probesSH: { value: grid.texture },
				probesMin: { value: grid.boundingBox.min.clone() },
				probesMax: { value: grid.boundingBox.max.clone() },
				probesResolution: { value: grid.resolution.clone() },
				intensity: { value: 0.32 }
			},
			vertexShader: `
				out vec3 vWorldPosition;
				out vec3 vWorldNormal;

				void main() {
					vec4 localPosition = vec4(position, 1.0);
					vec3 localNormal = normal;

					#ifdef USE_INSTANCING
						localPosition = instanceMatrix * localPosition;
						localNormal = mat3(instanceMatrix) * localNormal;
					#endif

					vec4 worldPosition = modelMatrix * localPosition;
					vWorldPosition = worldPosition.xyz;
					vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
					gl_Position = projectionMatrix * viewMatrix * worldPosition;
				}
			`,
			fragmentShader: `
				precision highp float;
				precision highp sampler3D;

				uniform sampler3D probesSH;
				uniform vec3 probesMin;
				uniform vec3 probesMax;
				uniform vec3 probesResolution;
				uniform float intensity;

				in vec3 vWorldPosition;
				in vec3 vWorldNormal;

				out vec4 outputColor;

				vec3 getGridIrradiance(vec3 worldPosition, vec3 worldNormal) {
					vec3 res = probesResolution;
					vec3 gridRange = probesMax - probesMin;
					vec3 resMinusOne = res - 1.0;
					vec3 probeSpacing = gridRange / resMinusOne;
					vec3 samplePosition = worldPosition + worldNormal * probeSpacing * 0.5;
					vec3 uvw = clamp((samplePosition - probesMin) / gridRange, 0.0, 1.0);
					uvw = uvw * resMinusOne / res + 0.5 / res;

					float nz = res.z;
					float paddedSlices = nz + 2.0;
					float atlasDepth = 7.0 * paddedSlices;
					float uvZBase = uvw.z * nz + 1.0;

					vec4 s0 = texture(probesSH, vec3(uvw.xy, (uvZBase) / atlasDepth));
					vec4 s1 = texture(probesSH, vec3(uvw.xy, (uvZBase + paddedSlices) / atlasDepth));
					vec4 s2 = texture(probesSH, vec3(uvw.xy, (uvZBase + 2.0 * paddedSlices) / atlasDepth));
					vec4 s3 = texture(probesSH, vec3(uvw.xy, (uvZBase + 3.0 * paddedSlices) / atlasDepth));
					vec4 s4 = texture(probesSH, vec3(uvw.xy, (uvZBase + 4.0 * paddedSlices) / atlasDepth));
					vec4 s5 = texture(probesSH, vec3(uvw.xy, (uvZBase + 5.0 * paddedSlices) / atlasDepth));
					vec4 s6 = texture(probesSH, vec3(uvw.xy, (uvZBase + 6.0 * paddedSlices) / atlasDepth));

					vec3 c0 = s0.xyz;
					vec3 c1 = vec3(s0.w, s1.xy);
					vec3 c2 = vec3(s1.zw, s2.x);
					vec3 c3 = s2.yzw;
					vec3 c4 = s3.xyz;
					vec3 c5 = vec3(s3.w, s4.xy);
					vec3 c6 = vec3(s4.zw, s5.x);
					vec3 c7 = s5.yzw;
					vec3 c8 = s6.xyz;

					vec3 worldNormalDirection = normalize(worldNormal);
					float x = worldNormalDirection.x;
					float y = worldNormalDirection.y;
					float z = worldNormalDirection.z;

					vec3 result = c0 * 0.886227;
					result += c1 * 2.0 * 0.511664 * y;
					result += c2 * 2.0 * 0.511664 * z;
					result += c3 * 2.0 * 0.511664 * x;
					result += c4 * 2.0 * 0.429043 * x * y;
					result += c5 * 2.0 * 0.429043 * y * z;
					result += c6 * (0.743125 * z * z - 0.247708);
					result += c7 * 2.0 * 0.429043 * x * z;
					result += c8 * 0.429043 * (x * x - y * y);
					return max(result, vec3(0.0));
				}

				void main() {
					vec3 irradiance = getGridIrradiance(vWorldPosition, normalize(vWorldNormal)) * intensity;
					outputColor = vec4(irradiance, 1.0);
				}
			`
		});
		material.toneMapped = false;
		return material;
	}

	function hideContributionDebugObjects() {
		scene.traverse(object => {
			if (!object.visible) return;
			if (object.userData.excludeFromGIContribution || object === helper || object.isLine || object.isPoints || object.isSprite) {
				object.visible = false;
				if (!hiddenForContribution.includes(object)) {
					hiddenForContribution.push(object);
				}
			}
		});
	}

	function restoreContributionDebugObjects() {
		for (const object of hiddenForContribution) {
			object.visible = true;
		}
		hiddenForContribution = [];
	}

	function applyContributionOverride() {
		if (!contributionVisible || !grid) return;
		clearContributionOverride();
		contributionMaterial = createContributionMaterial();
		if (!contributionMaterial) return;
		hiddenForContribution = [];
		hideContributionDebugObjects();
		scene.overrideMaterial = contributionMaterial;
	}

	function clearContributionOverride() {
		if (scene.overrideMaterial === contributionMaterial) {
			scene.overrideMaterial = null;
		}
		restoreContributionDebugObjects();
		if (!contributionMaterial) return;
		contributionMaterial.dispose();
		contributionMaterial = null;
	}

	function createGrid() {
		const width = gridWidth * cellSize + PROBE_VOLUME_PADDING;
		const depth = gridHeight * cellSize + PROBE_VOLUME_PADDING;
		const centerX = ((gridWidth - 1) * cellSize) / 2;
		const centerZ = ((gridHeight - 1) * cellSize) / 2;
		const nextGrid = new LightProbeGrid(
			width,
			PROBE_VOLUME_HEIGHT,
			depth,
			PROBE_COUNTS.width,
			PROBE_COUNTS.height,
			PROBE_COUNTS.depth
		);
		nextGrid.position.set(centerX, PROBE_VOLUME_Y, centerZ);
		return nextGrid;
	}

	function createBakeCloudOccluder() {
		if (!cloudTexture) return null;
		const width = gridWidth * cellSize + PROBE_VOLUME_PADDING;
		const depth = gridHeight * cellSize + PROBE_VOLUME_PADDING;
		const centerX = ((gridWidth - 1) * cellSize) / 2;
		const centerZ = ((gridHeight - 1) * cellSize) / 2;
		const material = new THREE.ShaderMaterial({
			uniforms: {
				uCloudTexture: { value: cloudTexture },
				uRepeat: { value: new THREE.Vector2(BAKE_CLOUD_REPEAT, BAKE_CLOUD_REPEAT) },
				uOpacity: { value: BAKE_CLOUD_OPACITY },
				uEdgeFade: { value: BAKE_CLOUD_EDGE_FADE }
			},
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			vertexShader: `
				varying vec2 vUv;

				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform sampler2D uCloudTexture;
				uniform vec2 uRepeat;
				uniform float uOpacity;
				uniform float uEdgeFade;
				varying vec2 vUv;

				void main() {
					float coverage = texture2D(uCloudTexture, vUv * uRepeat).r;
					float planeEdgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
					float planeEdgeFade = smoothstep(0.0, uEdgeFade, planeEdgeDistance);
					float opacity = smoothstep(0.25, 0.82, coverage) * planeEdgeFade * uOpacity;
					gl_FragColor = vec4(vec3(0.0), opacity);
				}
			`
		});
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(centerX, BAKE_CLOUD_Y, centerZ);
		mesh.frustumCulled = false;
		return mesh;
	}

	function disposeBakeCloudOccluder(mesh) {
		if (!mesh) return;
		scene.remove(mesh);
		mesh.geometry.dispose();
		mesh.material.dispose();
	}

	function createHelper() {
		if (!grid || helper || !helperVisible) return;
		helper = new LightProbeGridHelper(grid, HELPER_SPHERE_SIZE);
		helper.material.fragmentShader = helper.material.fragmentShader.replace(
			'gl_FragColor = vec4( max( result, vec3( 0.0 ) ), 1.0 );',
			`gl_FragColor = vec4( max( result * ${HELPER_BRIGHTNESS.toFixed(2)}, vec3( 0.0 ) ), 1.0 );`
		);
		helper.material.toneMapped = false;
		helper.material.needsUpdate = true;
		scene.add(helper);
	}

	function bake() {
		if (!enabled) return;
		if (!renderer.capabilities.isWebGL2) {
			enabled = false;
			helperVisible = false;
			disposeGrid();
			updateHints();
			console.warn('[GI] LightProbeGrid requires WebGL2');
			return;
		}

		disposeGrid();
		grid = createGrid();
		scene.add(grid);
		const bakeCloudOccluder = createBakeCloudOccluder();
		if (bakeCloudOccluder) scene.add(bakeCloudOccluder);
		grid.bake(renderer, scene, BAKE_OPTIONS);
		disposeBakeCloudOccluder(bakeCloudOccluder);
		createHelper();
		applyContributionOverride();
		updateHints();
	}

	function scheduleBake() {
		if (!enabled || bakeScheduled) return;
		bakeScheduled = true;
		requestAnimationFrame(() => {
			bakeScheduled = false;
			bake();
		});
	}

	function toggleEnabled() {
		enabled = !enabled;
		if (enabled) {
			scheduleBake();
		} else {
			contributionVisible = false;
			disposeGrid();
		}
		updateHints();
		return enabled;
	}

	function toggleHelper() {
		helperVisible = !helperVisible;
		if (helperVisible) {
			createHelper();
		} else {
			disposeHelper();
		}
		updateHints();
		return helperVisible;
	}

	function toggleContribution() {
		contributionVisible = !contributionVisible;
		if (contributionVisible) {
			if (!enabled) enabled = true;
			if (grid) {
				applyContributionOverride();
			} else {
				scheduleBake();
			}
		} else {
			clearContributionOverride();
		}
		updateHints();
		return contributionVisible;
	}

	function handleGenerationDone() {
		scheduleBake();
	}

	function handleGenerationReset() {
		clearContributionOverride();
		disposeGrid();
		updateHints();
	}

	function resetToDefaults() {
		enabled = false;
		helperVisible = false;
		contributionVisible = false;
		disposeGrid();
		updateHints();
	}

	function setCloudTexture(texture) {
		cloudTexture = texture;
	}

	function prepareContributionRender() {
		if (!contributionVisible) return;
		hideContributionDebugObjects();
	}

	return {
		toggleEnabled,
		toggleHelper,
		toggleContribution,
		handleGenerationReset,
		handleGenerationDone,
		resetToDefaults,
		setCloudTexture,
		prepareContributionRender,
		updateHints
	};
}
