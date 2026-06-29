import * as THREE from 'three';
import { getLevelBounds } from './Utility.js';
import { GLYPHS } from './Mojibake.js';

const GodraySystem = (function () {
	let scene = null;
	const rays = [];
	let beamTexture = null;
	let noiseTexels = null;
	let groundNoiseTexels = null;
	let groundNoiseTexture = null;
	let pulseSpeed = 0;
	let pulseAmount = 0;
	let debugMode = false;
	let frontFadeDebugEnabled = false;
	let groundVisible = true;
	let groundNoiseOnly = false;
	let godraysEnabled = true;
	let beamOpacityMultiplier = 1;
	let groundOpacityMultiplier = 1;
	let beamLowerAmount = 0;
	let placementSpread = 0.6;
	const groundColorOverride = new THREE.Color(0xffffff);
	let frontFadeInnerMesh = null;
	let frontFadeOuterMesh = null;
	let frontFadeCenterMesh = null;
	let frontFadeLastInner = -1;
	let frontFadeLastOuter = -1;

	const PULSE_SPEED_MIN = 1.2;
	const PULSE_SPEED_MAX = 5;
	const PULSE_AMOUNT_MIN = 0.79;
	const PULSE_AMOUNT_MAX = 0.99; // Keeps 1 + noise*amount strictly above zero
	const NOISE_TIME_SCALE = 1.35;
	const NOISE_TEXEL_COUNT = 512;
	const GROUND_NOISE_SIZE = 512;
	const GROUND_NOISE_PERIOD = 24;
	const GROUND_WORLD_UV_SCALE = 0.006; // Smaller is larger
	const GROUND_WORLD_SCROLL_X = 0.5;
	const GROUND_WORLD_SCROLL_Z = 0.4;
	const GROUND_NOISE_CONTRAST = 2.0; // 1.0 = unchanged; higher = stronger spatial variation.
	const GROUND_NOISE_BIAS = 0.0; // - darkens, + brightens after contrast.
	const GROUND_OUTPUT_DITHER_AMPLITUDE = 1.5 / 255; // Final alpha dither to hide output quantization bands.
	const BEAM_COUNT_REFERENCE_AREA = 25; // 5x5 reference area.
	const BEAMS_PER_5X5_AREA_MIN = 8;
	const BEAMS_PER_5X5_AREA_MAX = 30;
	const GODRAY_COLOR_MULTIPLIER_RGB = { r: 1.0, g: 1.0, b: 1.0 };
	const DITHER_MIN = 0;
	const DITHER_MAX = 0.12;
	const RELOCATE_SINE_SPEED_MIN = 0.05;
	const RELOCATE_SINE_SPEED_MAX = 0.85;
	const RELOCATE_HIDE_THRESHOLD = 0.01;
	const FRONT_CLEAR_CENTER_TOWARD_MID_RATIO = 0.5; // 0 = front edge, 1 = level center.
	const FRONT_CLEAR_INNER_RADIUS_RATIO = 0.24;
	const FRONT_CLEAR_OUTER_RADIUS_RATIO = 0.48;
	const FRONT_CLEAR_MIN_INNER_RADIUS = 2.5;
	const FRONT_CLEAR_MIN_OUTER_RADIUS = 5.5;
	const BEAM_VISIBILITY_EPSILON = 0.0005;
	const BEAM_LOWER_AMOUNT_MAX = 50;
	const GROUND_GLANCING_FADE_START = 0.18;
	const GROUND_GLANCING_FADE_END = 0.42;
	const WORLD_UP = new THREE.Vector3(0, 1, 0);
	const cameraForward = new THREE.Vector3();

	// Defaults
	const DEFAULTS = {
		count: 3,
		color: 0xfff8e0,
		beamAngle: Math.PI / 4,
		beamDirection: Math.PI / 3, // shared Y rotation for all beams (parallel rays)
		groundOpacity: 0.1,
		beamOpacity: 0.19,
		minWidth: 0.3,
		maxWidth: 1.4,
		minGroundPolygonSize: 2.5,
		maxGroundPolygonSize: 12.0,
		minGroundPolygonSides: 6,
		maxGroundPolygonSides: 12,
		minGroundSubPolygons: 2,
		maxGroundSubPolygons: 5,
		beamHeight: 25,
		minSpacing: 4.0,
		minBeamsPerPatch: BEAMS_PER_5X5_AREA_MIN,
		maxBeamsPerPatch: BEAMS_PER_5X5_AREA_MAX,
		pulseSpeed: 8.0,
		pulseAmount: 0.18,
		beamDither: 0.022
	};

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function randomRange(min, max) {
		return min + Math.random() * (max - min);
	}

	function randomInt(min, max) {
		const lo = Math.ceil(min);
		const hi = Math.floor(max);
		if (hi <= lo) return lo;
		return lo + Math.floor(Math.random() * (hi - lo + 1));
	}

	function sanitizePulseSpeed(value) {
		if (!Number.isFinite(value)) return DEFAULTS.pulseSpeed;
		return clamp(value, PULSE_SPEED_MIN, PULSE_SPEED_MAX);
	}

	function sanitizePulseAmount(value) {
		if (!Number.isFinite(value)) return DEFAULTS.pulseAmount;
		return clamp(value, PULSE_AMOUNT_MIN, PULSE_AMOUNT_MAX);
	}

	function sanitizeDitherAmount(value) {
		if (!Number.isFinite(value)) return DEFAULTS.beamDither;
		return clamp(value, DITHER_MIN, DITHER_MAX);
	}

	function setOpacityPercent(percent) {
		beamOpacityMultiplier = clamp(percent / 100, 0, 1);
	}

	function setGroundOpacityPercent(percent) {
		groundOpacityMultiplier = clamp(percent / 100, 0, 1);
	}

	function computeBeamCenterY(beamHeight, beamAngle) {
		return beamHeight * 0.5 * Math.sin(beamAngle) - beamLowerAmount;
	}

	function updateBeamPosition(beam, beamAngle, beamDirection) {
		beam.bottomX = beam.anchorBottomX;
		beam.bottomZ = beam.anchorBottomZ;
		const halfH = (beam.beamHeight || 0) * 0.5;
		const cx = beam.bottomX - halfH * Math.cos(beamAngle) * Math.sin(beamDirection);
		const cy = computeBeamCenterY(beam.beamHeight || 0, beamAngle);
		const cz = beam.bottomZ - halfH * Math.cos(beamAngle) * Math.cos(beamDirection);
		beam.mesh.position.set(cx, cy, cz);
	}

	function setBeamLowerAmount(value) {
		beamLowerAmount = clamp(value, 0, BEAM_LOWER_AMOUNT_MAX);
		for (let i = 0; i < rays.length; i++) {
			const ray = rays[i];
			for (let b = 0; b < ray.beams.length; b++) {
				const beam = ray.beams[b];
				updateBeamPosition(beam, ray.beamAngle, ray.beamDirection);
			}
		}
	}

	function setPlacementSpreadPercent(percent) {
		placementSpread = clamp(percent / 100, 0, 1);
	}

	function setGroundColor(color) {
		groundColorOverride.set(color);
		for (let i = 0; i < rays.length; i++) {
			const ray = rays[i];
			ray.baseGroundColor.copy(groundColorOverride);
			if (!groundNoiseOnly) {
				ray.groundMat.color.copy(ray.baseGroundColor);
				ray.groundMat.needsUpdate = true;
			}
		}
	}

	function computeRelocateMultiplier(time, speed, phase) {
		const raw = 0.5 + 0.5 * Math.sin(time * speed + phase);
		if (raw <= RELOCATE_HIDE_THRESHOLD) return 0;
		return THREE.MathUtils.smoothstep(raw, RELOCATE_HIDE_THRESHOLD, 1);
	}

	function computeGroundViewAngleFade(camera) {
		if (!camera) return 1;
		camera.getWorldDirection(cameraForward);
		const downwardAmount = Math.abs(cameraForward.dot(WORLD_UP));
		return THREE.MathUtils.smoothstep(downwardAmount, GROUND_GLANCING_FADE_START, GROUND_GLANCING_FADE_END);
	}

	function getGodrayColorMultiplier() {
		return new THREE.Color(
			clamp(GODRAY_COLOR_MULTIPLIER_RGB.r, 0, 2),
			clamp(GODRAY_COLOR_MULTIPLIER_RGB.g, 0, 2),
			clamp(GODRAY_COLOR_MULTIPLIER_RGB.b, 0, 2)
		);
	}

	// Converts "beams per 5x5 area" to an area-scaled count for this patch.
	function computeAreaBasedBeamCount(patchArea, minPerRefArea, maxPerRefArea) {
		const safeArea = Math.max(0.0001, patchArea);
		const safeMin = Math.max(0, minPerRefArea);
		const safeMax = Math.max(safeMin, maxPerRefArea);
		const minDensity = safeMin / BEAM_COUNT_REFERENCE_AREA;
		const maxDensity = safeMax / BEAM_COUNT_REFERENCE_AREA;
		const minCount = Math.max(1, Math.round(minDensity * safeArea));
		const maxCount = Math.max(minCount, Math.round(maxDensity * safeArea));
		if (maxCount <= minCount) return minCount;
		return minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
	}

	function fract(value) {
		return value - Math.floor(value);
	}

	function hash1(value) {
		return fract(Math.sin(value * 127.1 + 311.7) * 43758.5453123);
	}

	function hash2(x, y) {
		return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
	}

	function fade5(t) {
		return t * t * t * (t * (t * 6 - 15) + 10);
	}

	// 1D gradient noise in approximately [-1, 1].
	function perlin1D(x) {
		const x0 = Math.floor(x);
		const x1 = x0 + 1;
		const t = x - x0;
		const g0 = hash1(x0) * 2 - 1;
		const g1 = hash1(x1) * 2 - 1;
		const n0 = g0 * t;
		const n1 = g1 * (t - 1);
		const blended = THREE.MathUtils.lerp(n0, n1, fade5(t));
		return clamp(blended * 2.0, -1, 1);
	}

	function gradient2(ix, iy) {
		const angle = hash2(ix, iy) * Math.PI * 2;
		return { x: Math.cos(angle), y: Math.sin(angle) };
	}

	// 2D gradient noise in approximately [-1, 1], tiling at `period`.
	function perlin2D(x, y, period) {
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const tx = x - x0;
		const ty = y - y0;

		// Wrap grid coordinates for seamless tiling
		const ix0 = ((x0 % period) + period) % period;
		const iy0 = ((y0 % period) + period) % period;
		const ix1 = (ix0 + 1) % period;
		const iy1 = (iy0 + 1) % period;

		const g00 = gradient2(ix0, iy0);
		const g10 = gradient2(ix1, iy0);
		const g01 = gradient2(ix0, iy1);
		const g11 = gradient2(ix1, iy1);

		const n00 = g00.x * tx + g00.y * ty;
		const n10 = g10.x * (tx - 1) + g10.y * ty;
		const n01 = g01.x * tx + g01.y * (ty - 1);
		const n11 = g11.x * (tx - 1) + g11.y * (ty - 1);

		const u = fade5(tx);
		const v = fade5(ty);
		const nx0 = THREE.MathUtils.lerp(n00, n10, u);
		const nx1 = THREE.MathUtils.lerp(n01, n11, u);
		const blended = THREE.MathUtils.lerp(nx0, nx1, v);
		return clamp(blended * 1.6, -1, 1);
	}

	// Fractal Brownian motion layered from perlin1D for richer but smooth variation.
	function fbm1D(x) {
		let sum = 0;
		let amp = 0.6;
		let freq = 1.0;
		let norm = 0;
		for (let octave = 0; octave < 3; octave++) {
			sum += perlin1D(x * freq + octave * 19.19) * amp;
			norm += amp;
			amp *= 0.5;
			freq *= 2.0;
		}
		if (norm <= 0) return 0;
		return clamp(sum / norm, -1, 1);
	}

	function fbm2D(x, y) {
		let sum = 0;
		let amp = 0.6;
		let freq = 1.0;
		let norm = 0;
		for (let octave = 0; octave < 3; octave++) {
			const period = Math.round(GROUND_NOISE_PERIOD * freq);
			sum += perlin2D(x * freq, y * freq, period) * amp;
			norm += amp;
			amp *= 0.5;
			freq *= 2.0;
		}
		if (norm <= 0) return 0;
		return clamp(sum / norm, -1, 1);
	}

	function rebuildNoiseTexels() {
		noiseTexels = new Float32Array(NOISE_TEXEL_COUNT);
		for (let i = 0; i < NOISE_TEXEL_COUNT; i++) {
			const t = i / NOISE_TEXEL_COUNT;
			const x = t * 24.0;
			noiseTexels[i] = fbm1D(x);
		}
	}

	function rebuildGroundNoiseTexels() {
		groundNoiseTexels = new Float32Array(GROUND_NOISE_SIZE * GROUND_NOISE_SIZE);
		for (let y = 0; y < GROUND_NOISE_SIZE; y++) {
			for (let x = 0; x < GROUND_NOISE_SIZE; x++) {
				const u = x / GROUND_NOISE_SIZE;
				const v = y / GROUND_NOISE_SIZE;
				groundNoiseTexels[y * GROUND_NOISE_SIZE + x] = fbm2D(u * GROUND_NOISE_PERIOD, v * GROUND_NOISE_PERIOD);
			}
		}
	}

	function createGroundNoiseTexture() {
		if (!groundNoiseTexels || groundNoiseTexels.length === 0) return null;
		const size = GROUND_NOISE_SIZE;
		const data = new Float32Array(size * size * 4);
		for (let i = 0; i < groundNoiseTexels.length; i++) {
			let v = groundNoiseTexels[i] * 0.5 + 0.5; // [-1,1] -> [0,1]
			v = (v - 0.5) * GROUND_NOISE_CONTRAST + 0.5;
			v = clamp(v + GROUND_NOISE_BIAS, 0, 1);
			const idx = i * 4;
			data[idx] = v;
			data[idx + 1] = v;
			data[idx + 2] = v;
			data[idx + 3] = 1.0;
		}
		const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.needsUpdate = true;
		return tex;
	}

	function applyGroundFinalDither(material) {
		material.dithering = true;
		material.onBeforeCompile = (shader) => {
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <dithering_fragment>',
				`
				float _groundDitherNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123);
				gl_FragColor.a = clamp(gl_FragColor.a + (_groundDitherNoise - 0.5) * ${GROUND_OUTPUT_DITHER_AMPLITUDE.toFixed(8)}, 0.0, 1.0);
				#include <dithering_fragment>
				`
			);
		};
		material.customProgramCacheKey = () => `ground-final-dither-${GROUND_OUTPUT_DITHER_AMPLITUDE.toFixed(8)}`;
		material.needsUpdate = true;
	}

	// Wrapped linear texel interpolation for smoother temporal transitions.
	function sampleNoiseTexel(sampleX) {
		if (!noiseTexels || noiseTexels.length === 0) return 0;
		const wrapped = ((sampleX % NOISE_TEXEL_COUNT) + NOISE_TEXEL_COUNT) % NOISE_TEXEL_COUNT;
		const index0 = Math.floor(wrapped);
		const index1 = (index0 + 1) % NOISE_TEXEL_COUNT;
		const t = wrapped - index0;
		return THREE.MathUtils.lerp(noiseTexels[index0], noiseTexels[index1], t);
	}

	function init(sceneRef) {
		scene = sceneRef;
		pulseSpeed = DEFAULTS.pulseSpeed;
		pulseAmount = DEFAULTS.pulseAmount;
		rebuildNoiseTexels();
		rebuildGroundNoiseTexels();
	}

	function createBeamTexture(color, width = 96, height = 512, ditherAmount = DEFAULTS.beamDither) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		const r = (color >> 16) & 0xff;
		const g = (color >> 8) & 0xff;
		const b = color & 0xff;

		const vertical = ctx.createLinearGradient(0, 0, 0, height);
		vertical.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
		vertical.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.55)`);
		vertical.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, 0.15)`);
		vertical.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
		ctx.fillStyle = vertical;
		ctx.fillRect(0, 0, width, height);

		// Tiny 10% horizontal edge softening
		const horizontalMask = ctx.createLinearGradient(0, 0, width, 0);
		horizontalMask.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
		horizontalMask.addColorStop(0.1, 'rgba(255, 255, 255, 1.0)');
		horizontalMask.addColorStop(0.9, 'rgba(255, 255, 255, 1.0)');
		horizontalMask.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
		ctx.globalCompositeOperation = 'destination-in';
		ctx.fillStyle = horizontalMask;
		ctx.fillRect(0, 0, width, height);
		ctx.globalCompositeOperation = 'source-over';

		// Ordered alpha dithering to reduce visible banding in smooth gradients.
		const clampedDither = sanitizeDitherAmount(ditherAmount);
		if (clampedDither > 0) {
			const bayer4 = [
				[0, 8, 2, 10],
				[12, 4, 14, 6],
				[3, 11, 1, 9],
				[15, 7, 13, 5]
			];
			const imageData = ctx.getImageData(0, 0, width, height);
			const data = imageData.data;
			const maxDelta = clampedDither * 255;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const threshold = (bayer4[y & 3][x & 3] / 15) * 2 - 1;
					const alpha = data[idx + 3];
					const dithered = alpha + threshold * maxDelta;
					data[idx + 3] = Math.round(clamp(dithered, 0, 255));
				}
			}
			ctx.putImageData(imageData, 0, 0);
		}

		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.flipY = true;
		return texture;
	}

	// Create a single polygon ring with vertex-color edge fade:
	// outer verts alpha=0, inset inner verts alpha=1, center alpha=1
	function createFadedPolygonGeo(sides, radius, cx, cy, insetRatio) {
		// Generate outer ring points
		const outer = [];
		const inner = [];
		for (let i = 0; i < sides; i++) {
			const angle = (i / sides) * Math.PI * 2;
			const r = radius * (0.65 + Math.random() * 0.35);
			outer.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
			inner.push({ x: cx + Math.cos(angle) * r * insetRatio, y: cy + Math.sin(angle) * r * insetRatio });
		}

		// Verts: [outer0..outerN-1, inner0..innerN-1, center]
		const vertCount = sides * 2 + 1;
		const positions = new Float32Array(vertCount * 3);
		const colors = new Float32Array(vertCount * 4);

		for (let i = 0; i < sides; i++) {
			// Outer vertex (alpha = 0)
			positions[i * 3] = outer[i].x;
			positions[i * 3 + 1] = outer[i].y;
			positions[i * 3 + 2] = 0;
			colors[i * 4] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1; colors[i * 4 + 3] = 0;

			// Inner vertex (alpha = 1)
			const ii = sides + i;
			positions[ii * 3] = inner[i].x;
			positions[ii * 3 + 1] = inner[i].y;
			positions[ii * 3 + 2] = 0;
			colors[ii * 4] = 1; colors[ii * 4 + 1] = 1; colors[ii * 4 + 2] = 1; colors[ii * 4 + 3] = 1;
		}

		// Center vertex (alpha = 1)
		const ci = sides * 2;
		positions[ci * 3] = cx;
		positions[ci * 3 + 1] = cy;
		positions[ci * 3 + 2] = 0;
		colors[ci * 4] = 1; colors[ci * 4 + 1] = 1; colors[ci * 4 + 2] = 1; colors[ci * 4 + 3] = 1;

		// Indices: outer-to-inner fade strip + inner fan to center
		const idxArr = [];
		for (let i = 0; i < sides; i++) {
			const next = (i + 1) % sides;
			// Fade strip: two triangles per edge
			idxArr.push(i, next, sides + i);
			idxArr.push(next, sides + next, sides + i);
			// Inner fan to center
			idxArr.push(sides + i, sides + next, ci);
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
		geo.setIndex(idxArr);
		return geo;
	}

	function createTessellatedGroundGeo(radius, tessellationConfig) {
		const inset = 0.65;
		const minSize = tessellationConfig.minSize;
		const maxSize = tessellationConfig.maxSize;
		const minSides = Math.max(3, Math.floor(tessellationConfig.minSides));
		const maxSides = Math.max(minSides, Math.floor(tessellationConfig.maxSides));
		const minSubs = Math.max(1, Math.floor(tessellationConfig.minSubPolygons));
		const maxSubs = Math.max(minSubs, Math.floor(tessellationConfig.maxSubPolygons));
		const sizeSpan = Math.max(0.0001, maxSize - minSize);
		const sizeT = clamp((radius - minSize) / sizeSpan, 0, 1);

		// Larger polygons get denser tessellation.
		const mainSidesBase = Math.round(THREE.MathUtils.lerp(minSides, maxSides, sizeT));
		const mainSides = randomInt(mainSidesBase, Math.min(maxSides, mainSidesBase + 2));
		const geos = [];
		geos.push(createFadedPolygonGeo(mainSides, radius, 0, 0, inset));

		const subCountBase = Math.round(THREE.MathUtils.lerp(minSubs, maxSubs, sizeT));
		const subCount = randomInt(Math.max(minSubs, subCountBase - 1), Math.min(maxSubs, subCountBase + 1));
		for (let i = 0; i < subCount; i++) {
			let subSidesMin = Math.max(5, mainSides - 3);
			// Avoid low-point sub-polygons on larger patches.
			if (sizeT >= 0.6) {
				subSidesMin = Math.max(subSidesMin, 6);
			}
			const subSidesMax = Math.max(subSidesMin, mainSides);
			const subSides = randomInt(subSidesMin, subSidesMax);
			const subRadius = radius * (0.35 + Math.random() * 0.4);
			const offsetAngle = Math.random() * Math.PI * 2;
			const offsetDist = radius * (0.3 + Math.random() * 0.5);
			const ox = Math.cos(offsetAngle) * offsetDist;
			const oy = Math.sin(offsetAngle) * offsetDist;
			geos.push(createFadedPolygonGeo(subSides, subRadius, ox, oy, inset));
		}

		const merged = mergeBufferGeometries(geos);
		geos.forEach(g => g.dispose());
		return merged;
	}

	let cachedLevelBounds = null;
	const reusableFrontFadeParams = {
		centerX: 0,
		centerZ: 0,
		innerRadius: 0,
		outerRadius: 0
	};

	function getCachedLevelBounds() {
		if (!cachedLevelBounds) {
			cachedLevelBounds = getLevelBounds();
		}
		return cachedLevelBounds;
	}

	function updateFrontFadeParams(bounds) {
		if (!bounds || !bounds.initialized) return null;
		const base = Math.min(bounds.width, bounds.height);
		const innerRadius = Math.max(FRONT_CLEAR_MIN_INNER_RADIUS, base * FRONT_CLEAR_INNER_RADIUS_RATIO);
		const outerRadius = Math.max(Math.max(FRONT_CLEAR_MIN_OUTER_RADIUS, base * FRONT_CLEAR_OUTER_RADIUS_RATIO), innerRadius + 0.001);
		const midZ = (bounds.minZ + bounds.maxZ) * 0.5;
		reusableFrontFadeParams.centerX = (bounds.minX + bounds.maxX) * 0.5;
		reusableFrontFadeParams.centerZ = THREE.MathUtils.lerp(bounds.maxZ, midZ, FRONT_CLEAR_CENTER_TOWARD_MID_RATIO);
		reusableFrontFadeParams.innerRadius = innerRadius;
		reusableFrontFadeParams.outerRadius = outerRadius;
		return reusableFrontFadeParams;
	}

	function computeFrontFadeFromDistance(distance, fadeParams) {
		if (!fadeParams) return 1;
		const dist = distance;
		if (dist <= fadeParams.innerRadius) return 0;
		if (dist >= fadeParams.outerRadius) return 1;
		const t = (dist - fadeParams.innerRadius) / (fadeParams.outerRadius - fadeParams.innerRadius);
		// Smooth radial fade from zero (center) to one (outside ring).
		return t * t * (3 - 2 * t);
	}

	function distancePointToSegment2D(px, pz, ax, az, bx, bz) {
		const abx = bx - ax;
		const abz = bz - az;
		const apx = px - ax;
		const apz = pz - az;
		const abLenSq = abx * abx + abz * abz;
		if (abLenSq <= 0.0000001) {
			const dx = px - ax;
			const dz = pz - az;
			return Math.sqrt(dx * dx + dz * dz);
		}
		let t = (apx * abx + apz * abz) / abLenSq;
		t = clamp(t, 0, 1);
		const cx = ax + abx * t;
		const cz = az + abz * t;
		const dx = px - cx;
		const dz = pz - cz;
		return Math.sqrt(dx * dx + dz * dz);
	}

	function computeBeamFrontFadeMultiplier(beam, ray, fadeParams) {
		if (!fadeParams) return 1;
		const bottomX = beam.bottomX || 0;
		const bottomZ = beam.bottomZ || 0;
		const projectedLength = (beam.beamHeight || 0) * Math.max(0, Math.cos(ray.beamAngle || 0));
		const dirX = Math.sin(ray.beamDirection || 0);
		const dirZ = Math.cos(ray.beamDirection || 0);
		const topX = bottomX - dirX * projectedLength;
		const topZ = bottomZ - dirZ * projectedLength;
		const minDistance = distancePointToSegment2D(
			fadeParams.centerX,
			fadeParams.centerZ,
			bottomX,
			bottomZ,
			topX,
			topZ
		);
		return computeFrontFadeFromDistance(minDistance, fadeParams);
	}

	function clearFrontFadeDebugVisuals(dispose = false) {
		const meshes = [frontFadeInnerMesh, frontFadeOuterMesh, frontFadeCenterMesh];
		for (let i = 0; i < meshes.length; i++) {
			const mesh = meshes[i];
			if (!mesh) continue;
			if (scene) scene.remove(mesh);
			if (dispose) {
				if (mesh.geometry) mesh.geometry.dispose();
				if (mesh.material) mesh.material.dispose();
			}
		}
		if (dispose) {
			frontFadeInnerMesh = null;
			frontFadeOuterMesh = null;
			frontFadeCenterMesh = null;
			frontFadeLastInner = -1;
			frontFadeLastOuter = -1;
		}
	}

	function ensureFrontFadeDebugVisuals(fadeParams) {
		if (!scene || !fadeParams) return;
		const inner = fadeParams.innerRadius;
		const outer = fadeParams.outerRadius;
		const needsRebuild = !frontFadeInnerMesh || !frontFadeOuterMesh || !frontFadeCenterMesh ||
			Math.abs(inner - frontFadeLastInner) > 0.001 ||
			Math.abs(outer - frontFadeLastOuter) > 0.001;
		if (needsRebuild) {
			clearFrontFadeDebugVisuals(true);
			const innerGeo = new THREE.CircleGeometry(inner, 96);
			const innerMat = new THREE.MeshBasicMaterial({
				color: 0x4ac3ff,
				transparent: true,
				opacity: 0.14,
				depthWrite: false
			});
			frontFadeInnerMesh = new THREE.Mesh(innerGeo, innerMat);
			frontFadeInnerMesh.rotation.x = -Math.PI / 2;
			frontFadeInnerMesh.renderOrder = 12;
			scene.add(frontFadeInnerMesh);

			const outerGeo = new THREE.RingGeometry(inner, outer, 128);
			const outerMat = new THREE.MeshBasicMaterial({
				color: 0xb3e8ff,
				transparent: true,
				opacity: 0.24,
				depthWrite: false
			});
			frontFadeOuterMesh = new THREE.Mesh(outerGeo, outerMat);
			frontFadeOuterMesh.rotation.x = -Math.PI / 2;
			frontFadeOuterMesh.renderOrder = 13;
			scene.add(frontFadeOuterMesh);

			const centerGeo = new THREE.CircleGeometry(Math.max(0.12, inner * 0.06), 28);
			const centerMat = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.6,
				depthWrite: false
			});
			frontFadeCenterMesh = new THREE.Mesh(centerGeo, centerMat);
			frontFadeCenterMesh.rotation.x = -Math.PI / 2;
			frontFadeCenterMesh.renderOrder = 14;
			scene.add(frontFadeCenterMesh);

			frontFadeLastInner = inner;
			frontFadeLastOuter = outer;
		}

		const x = fadeParams.centerX;
		const z = fadeParams.centerZ;
		frontFadeInnerMesh.position.set(x, 0.035, z);
		frontFadeOuterMesh.position.set(x, 0.036, z);
		frontFadeCenterMesh.position.set(x, 0.037, z);
		frontFadeInnerMesh.visible = true;
		frontFadeOuterMesh.visible = true;
		frontFadeCenterMesh.visible = true;
	}

	function applyWorldXZUvs(geo, worldX, worldZ, uvScale = GROUND_WORLD_UV_SCALE) {
		const pos = geo.attributes.position;
		if (!pos) return;
		const uv = new Float32Array(pos.count * 2);
		for (let i = 0; i < pos.count; i++) {
			const localX = pos.getX(i);
			const localY = pos.getY(i);
			const sampleX = (worldX + localX) * uvScale;
			const sampleZ = (worldZ + localY) * uvScale;
			uv[i * 2] = sampleX;
			uv[i * 2 + 1] = sampleZ;
		}
		geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	}

	function mergeBufferGeometries(geometries) {
		let totalVerts = 0;
		let totalIndices = 0;
		for (const geo of geometries) {
			totalVerts += geo.attributes.position.count;
			totalIndices += geo.index ? geo.index.count : 0;
		}
		const positions = new Float32Array(totalVerts * 3);
		const vertColors = new Float32Array(totalVerts * 4);
		const indices = new Uint16Array(totalIndices);
		let vertOffset = 0;
		let colorOffset = 0;
		let idxOffset = 0;
		let baseVertex = 0;
		for (const geo of geometries) {
			const pos = geo.attributes.position;
			const col = geo.attributes.color;
			for (let i = 0; i < pos.count * 3; i++) {
				positions[vertOffset + i] = pos.array[i];
			}
			for (let i = 0; i < col.count * 4; i++) {
				vertColors[colorOffset + i] = col.array[i];
			}
			if (geo.index) {
				for (let i = 0; i < geo.index.count; i++) {
					indices[idxOffset + i] = geo.index.array[i] + baseVertex;
				}
				idxOffset += geo.index.count;
			}
			vertOffset += pos.count * 3;
			colorOffset += col.count * 4;
			baseVertex += pos.count;
		}
		const merged = new THREE.BufferGeometry();
		merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		merged.setAttribute('color', new THREE.BufferAttribute(vertColors, 4));
		merged.setIndex(new THREE.BufferAttribute(indices, 1));
		return merged;
	}

	function generate(options = {}) {
		clear();

		const {
			count = DEFAULTS.count,
			color = DEFAULTS.color,
			beamAngle = DEFAULTS.beamAngle,
			beamDirection = DEFAULTS.beamDirection,
			groundOpacity = DEFAULTS.groundOpacity,
			beamOpacity = DEFAULTS.beamOpacity,
			minWidth = DEFAULTS.minWidth,
			maxWidth = DEFAULTS.maxWidth,
			minGroundPolygonSize = DEFAULTS.minGroundPolygonSize,
			maxGroundPolygonSize = DEFAULTS.maxGroundPolygonSize,
			minGroundPolygonSides = DEFAULTS.minGroundPolygonSides,
			maxGroundPolygonSides = DEFAULTS.maxGroundPolygonSides,
			minGroundSubPolygons = DEFAULTS.minGroundSubPolygons,
			maxGroundSubPolygons = DEFAULTS.maxGroundSubPolygons,
			beamHeight = DEFAULTS.beamHeight,
			minSpacing = DEFAULTS.minSpacing,
			minBeamsPerPatch: minBeamsPer5x5Area = DEFAULTS.minBeamsPerPatch,
			maxBeamsPerPatch: maxBeamsPer5x5Area = DEFAULTS.maxBeamsPerPatch,
			pulseSpeed: pulseSpeedOption = DEFAULTS.pulseSpeed,
			pulseAmount: pulseAmountOption = DEFAULTS.pulseAmount,
			beamDither: beamDitherOption = DEFAULTS.beamDither,
			spread = placementSpread,
			logGeneration = false
		} = options;

		pulseSpeed = sanitizePulseSpeed(pulseSpeedOption);
		pulseAmount = sanitizePulseAmount(pulseAmountOption);
		const beamDither = sanitizeDitherAmount(beamDitherOption);
		const godrayColorMultiplier = getGodrayColorMultiplier();
		const groundBaseColor = groundColorOverride.clone().multiply(godrayColorMultiplier);
		const minPatchSize = Math.max(0.1, minGroundPolygonSize);
		const maxPatchSize = Math.max(minPatchSize, maxGroundPolygonSize);
		const groundTessellationConfig = {
			minSize: minPatchSize,
			maxSize: maxPatchSize,
			minSides: minGroundPolygonSides,
			maxSides: maxGroundPolygonSides,
			minSubPolygons: minGroundSubPolygons,
			maxSubPolygons: maxGroundSubPolygons
		};

		if (logGeneration) {
			console.log(`[GodraySystem] beamAngle: ${(beamAngle * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}, beamDirection: ${(beamDirection * 180 / Math.PI).toFixed(1)}${GLYPHS.degree}`);
		}

		const bounds = getCachedLevelBounds();
		if (!bounds || !bounds.initialized) return;
		if (!noiseTexels) rebuildNoiseTexels();
		if (!groundNoiseTexels) rebuildGroundNoiseTexels();
		if (groundNoiseTexture) {
			groundNoiseTexture.dispose();
		}
		groundNoiseTexture = createGroundNoiseTexture();

		// Create shared beam texture
		if (beamTexture) beamTexture.dispose();
		beamTexture = createBeamTexture(color, 96, 512, beamDither);

		// Ground polygons use flat color for now
		const margin = 1.5;
		const positions = [];
		const centerX = (bounds.minX + bounds.maxX) * 0.5;
		const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
		const maxRadius = Math.max(0, Math.min(bounds.width, bounds.height) * 0.5 - margin);
		const placementRadius = maxRadius * clamp(spread, 0, 1);

		for (let i = 0; i < count; i++) {
			let x, z;
			let attempts = 0;
			do {
				const placementAngle = Math.random() * Math.PI * 2;
				const radius = placementRadius * Math.sqrt(Math.random());
				x = centerX + Math.cos(placementAngle) * radius;
				z = centerZ + Math.sin(placementAngle) * radius;
				x = THREE.MathUtils.clamp(x, bounds.minX + margin, bounds.maxX - margin);
				z = THREE.MathUtils.clamp(z, bounds.minZ + margin, bounds.maxZ - margin);
				attempts++;
			} while (attempts < 30 && positions.some(p => {
				const dx = p.x - x;
				const dz = p.z - z;
				return Math.sqrt(dx * dx + dz * dz) < minSpacing;
			}));
			positions.push({ x, z });

			const groundSize = minPatchSize + Math.random() * (maxPatchSize - minPatchSize);
			const phaseOffset = Math.random() * Math.PI * 2;
			const patchArea = groundSize * groundSize;
			const beamCount = computeAreaBasedBeamCount(patchArea, minBeamsPer5x5Area, maxBeamsPer5x5Area);

			// Ground polygon
			const groundGeo = createTessellatedGroundGeo(groundSize, groundTessellationConfig);
			applyWorldXZUvs(groundGeo, x, z);
			const groundMat = new THREE.MeshBasicMaterial({
				color: groundBaseColor.clone(),
				vertexColors: true,
				transparent: true,
				opacity: groundOpacity,
				alphaMap: groundNoiseTexture,
				blending: THREE.AdditiveBlending,
				depthTest: false,
				depthWrite: false
			});
			applyGroundFinalDither(groundMat);
			const groundMesh = new THREE.Mesh(groundGeo, groundMat);
			groundMesh.rotation.x = -Math.PI / 2;
			groundMesh.position.set(x, 0.01, z);
			groundMesh.renderOrder = 3000;
			groundMesh.userData.excludeFromGIContribution = true;
			groundMesh.visible = groundVisible;
			scene.add(groundMesh);

			// Multiple beam quads per patch, spread across the ground shape
			const beams = [];
			for (let b = 0; b < beamCount; b++) {
				const beamWidth = minWidth + Math.random() * (maxWidth - minWidth);
				// Scatter beams within the ground polygon area
				const spreadAngle = Math.random() * Math.PI * 2;
				const spreadDist = Math.random() * groundSize * 0.6;
				const bx = x + Math.cos(spreadAngle) * spreadDist;
				const bz = z + Math.sin(spreadAngle) * spreadDist;

				const beamGeo = new THREE.PlaneGeometry(beamWidth, beamHeight);
				const beamMat = new THREE.MeshBasicMaterial({
					map: debugMode ? null : beamTexture,
					color: godrayColorMultiplier.clone(),
					transparent: true,
					opacity: beamOpacity,
					side: THREE.DoubleSide,
					blending: THREE.AdditiveBlending,
					depthWrite: false
				});
				const beamMesh = new THREE.Mesh(beamGeo, beamMat);
				beamMesh.rotation.set(0, beamDirection, 0);
				beamMesh.rotateX(beamAngle - Math.PI / 2);
				beamMesh.renderOrder = 2;
				beamMesh.userData.excludeFromGIContribution = true;
				scene.add(beamMesh);
				const beamData = {
					mesh: beamMesh,
					mat: beamMat,
					geo: beamGeo,
					baseColor: godrayColorMultiplier.clone(),
					anchorBottomX: bx,
					anchorBottomZ: bz,
					bottomX: bx,
					bottomZ: bz,
					phase: Math.random() * Math.PI * 2,
					noisePhase: Math.random() * NOISE_TEXEL_COUNT,
					relocateSinePhase: Math.random() * Math.PI * 2,
					relocateSineSpeed: randomRange(RELOCATE_SINE_SPEED_MIN, RELOCATE_SINE_SPEED_MAX),
					relocateSineTime: randomRange(0, 1000),
					relocatedWhileHidden: false,
					beamHeight
				};
				updateBeamPosition(beamData, beamAngle, beamDirection);
				beams.push(beamData);
			}

			const rayData = {
				groundMesh,
				groundMat,
				groundGeo,
				beams,
				baseGroundOpacity: groundOpacity,
				baseGroundColor: groundBaseColor.clone(),
				baseBeamOpacity: beamOpacity,
				phaseOffset,
				noisePhase: Math.random() * NOISE_TEXEL_COUNT,
				patchX: x,
				patchZ: z,
				groundSize,
				beamAngle,
				beamDirection
			};
			applyRayVisualMode(rayData);
			rays.push(rayData);
		}
	}

	function repositionBeamWithinRay(ray, beam) {
		const spreadAngle = Math.random() * Math.PI * 2;
		const spreadDist = Math.random() * ray.groundSize * 0.6;
		const bx = ray.patchX + Math.cos(spreadAngle) * spreadDist;
		const bz = ray.patchZ + Math.sin(spreadAngle) * spreadDist;
		beam.anchorBottomX = bx;
		beam.anchorBottomZ = bz;
		updateBeamPosition(beam, ray.beamAngle, ray.beamDirection);
	}

	function applyRayVisualMode(ray) {
		const showBeams = godraysEnabled && !groundNoiseOnly;
		for (let i = 0; i < ray.beams.length; i++) {
			const beam = ray.beams[i];
			beam.mesh.visible = showBeams;
			beam.mat.map = (debugMode || frontFadeDebugEnabled) ? null : beamTexture;
			beam.mat.needsUpdate = true;
		}
		if (groundNoiseOnly) {
			ray.groundMat.color.set(0xffffff);
			ray.groundMat.vertexColors = false;
		} else {
			ray.groundMat.color.copy(ray.baseGroundColor);
			ray.groundMat.vertexColors = true;
		}
		ray.groundMat.needsUpdate = true;
		ray.groundMesh.visible = godraysEnabled && (groundNoiseOnly ? true : groundVisible);
	}

	function update(deltaTime, camera) {
		const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : (1 / 60);
		const time = performance.now() * 0.001;
		const noiseScroll = time * pulseSpeed * NOISE_TIME_SCALE;
		const groundViewAngleFade = computeGroundViewAngleFade(camera);
		const bounds = getCachedLevelBounds();
		const frontFadeParams = updateFrontFadeParams(bounds);
		if (frontFadeDebugEnabled) {
			ensureFrontFadeDebugVisuals(frontFadeParams);
		} else {
			if (frontFadeInnerMesh) frontFadeInnerMesh.visible = false;
			if (frontFadeOuterMesh) frontFadeOuterMesh.visible = false;
			if (frontFadeCenterMesh) frontFadeCenterMesh.visible = false;
		}
		if (groundNoiseTexture) {
			const scrollX = time * GROUND_WORLD_SCROLL_X * 0.01;
			const scrollZ = time * GROUND_WORLD_SCROLL_Z * 0.01;
			groundNoiseTexture.offset.set(scrollX, scrollZ);
		}
		for (let i = 0; i < rays.length; i++) {
			const ray = rays[i];
			ray.groundMat.opacity = clamp(ray.baseGroundOpacity * groundOpacityMultiplier * groundViewAngleFade, 0, 1);
			for (let b = 0; b < ray.beams.length; b++) {
				const beam = ray.beams[b];
				if (!godraysEnabled || groundNoiseOnly) {
					beam.mesh.visible = false;
					continue;
				}
				beam.relocateSineTime += dt;
				const beamRelocateMultiplier = computeRelocateMultiplier(beam.relocateSineTime, beam.relocateSineSpeed, beam.relocateSinePhase);
				if (beamRelocateMultiplier <= 0) {
					if (!beam.relocatedWhileHidden) {
						repositionBeamWithinRay(ray, beam);
						beam.noisePhase = Math.random() * NOISE_TEXEL_COUNT;
						beam.relocatedWhileHidden = true;
					}
					beam.mesh.visible = false;
					beam.mat.opacity = 0;
					continue;
				}
				beam.relocatedWhileHidden = false;

				const beamNoise = sampleNoiseTexel(beam.noisePhase + noiseScroll * 1.35);
				const beamPulse = 1 + beamNoise * pulseAmount;
				const frontFadeMultiplier = computeBeamFrontFadeMultiplier(beam, ray, frontFadeParams);
				const targetOpacity = clamp(ray.baseBeamOpacity * beamOpacityMultiplier * beamPulse * beamRelocateMultiplier * frontFadeMultiplier, 0, 1);
				if (frontFadeDebugEnabled) {
					beam.mat.color.setScalar(frontFadeMultiplier);
				} else if (beam.baseColor) {
					beam.mat.color.copy(beam.baseColor);
				}
				const visible = targetOpacity > BEAM_VISIBILITY_EPSILON;
				beam.mesh.visible = visible;
				if (!visible) {
					beam.mat.opacity = 0;
					continue;
				}
				beam.mat.opacity = targetOpacity;
			}
		}
	}

	function toggleDebug() {
		debugMode = !debugMode;
		for (const ray of rays) {
			applyRayVisualMode(ray);
		}
		return debugMode;
	}

	function toggleFrontFadeDebug() {
		frontFadeDebugEnabled = !frontFadeDebugEnabled;
		for (const ray of rays) {
			applyRayVisualMode(ray);
		}
		if (!frontFadeDebugEnabled) {
			if (frontFadeInnerMesh) frontFadeInnerMesh.visible = false;
			if (frontFadeOuterMesh) frontFadeOuterMesh.visible = false;
			if (frontFadeCenterMesh) frontFadeCenterMesh.visible = false;
		}
		return frontFadeDebugEnabled;
	}

	function toggleGround() {
		groundVisible = !groundVisible;
		for (const ray of rays) {
			applyRayVisualMode(ray);
		}
		return groundVisible;
	}

	function toggleGroundNoiseOnly() {
		groundNoiseOnly = !groundNoiseOnly;
		for (const ray of rays) {
			applyRayVisualMode(ray);
		}
		return groundNoiseOnly;
	}

	function toggleEnabled() {
		godraysEnabled = !godraysEnabled;
		for (const ray of rays) {
			applyRayVisualMode(ray);
		}
		return godraysEnabled;
	}

	function clear() {
		clearFrontFadeDebugVisuals(true);
		for (let i = rays.length - 1; i >= 0; i--) {
			const ray = rays[i];
			scene.remove(ray.groundMesh);
			ray.groundGeo.dispose();
			ray.groundMat.dispose();
			for (let b = 0; b < ray.beams.length; b++) {
				scene.remove(ray.beams[b].mesh);
				ray.beams[b].geo.dispose();
				ray.beams[b].mat.dispose();
			}
		}
		rays.length = 0;
	}

	function dispose() {
		clear();
		clearFrontFadeDebugVisuals(true);
		if (beamTexture) {
			beamTexture.dispose();
			beamTexture = null;
		}
		if (groundNoiseTexture) {
			groundNoiseTexture.dispose();
			groundNoiseTexture = null;
		}
		noiseTexels = null;
		groundNoiseTexels = null;
	}

	return {
		init,
		generate,
		update,
		setOpacityPercent,
		setGroundOpacityPercent,
		setGroundColor,
		setBeamLowerAmount,
		setPlacementSpreadPercent,
		toggleDebug,
		toggleFrontFadeDebug,
		toggleGround,
		toggleGroundNoiseOnly,
		toggleEnabled,
		clear,
		dispose
	};
})();

export default GodraySystem;
