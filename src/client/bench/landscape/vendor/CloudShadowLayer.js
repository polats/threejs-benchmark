import * as THREE from 'three';
import { CLOUD_UV_SCROLL_PER_SECOND, DEFAULT_CLOUD_HEIGHT_PERCENT, DEFAULT_CLOUD_SCALE_PERCENT, DEFAULT_SKY_CLOUD_BOTTOM_COLOR, DEFAULT_SKY_CLOUD_LAYER_COUNT, DEFAULT_SKY_CLOUD_LAYER_SPACING_PERCENT, DEFAULT_SKY_CLOUD_OPACITY_PERCENT, DEFAULT_SKY_CLOUD_TOP_COLOR, SKY_CLOUD_BASE_REPEAT } from './CloudSettings.js';

const MAP_CENTER = new THREE.Vector3(11, 0, 9);
const PLANE_SIZE = 80;

export function createCloudShadowLayer(scene, {
	cloudTexture = makeProceduralCloudTexture(),
	cloudHeight = 30
} = {}) {
	const baseCloudHeight = cloudHeight;
	cloudTexture.wrapS = THREE.RepeatWrapping;
	cloudTexture.wrapT = THREE.RepeatWrapping;
	cloudTexture.repeat.set(SKY_CLOUD_BASE_REPEAT, SKY_CLOUD_BASE_REPEAT);

	const layers = [];
	let heightPercent = DEFAULT_CLOUD_HEIGHT_PERCENT;
	let layerSpacingPercent = DEFAULT_SKY_CLOUD_LAYER_SPACING_PERCENT;
	let scalePercent = DEFAULT_CLOUD_SCALE_PERCENT;
	let opacityPercent = DEFAULT_SKY_CLOUD_OPACITY_PERCENT;
	let visible = true;
	const bottomColor = new THREE.Color(DEFAULT_SKY_CLOUD_BOTTOM_COLOR);
	const topColor = new THREE.Color(DEFAULT_SKY_CLOUD_TOP_COLOR);

	function createLayer(index) {
		const cloudMaterial = new THREE.ShaderMaterial({
			uniforms: {
				uCloudTexture: { value: cloudTexture },
				uOffset: { value: new THREE.Vector2(index * 0.37, index * 0.19) },
				uRepeat: { value: new THREE.Vector2(SKY_CLOUD_BASE_REPEAT * scalePercent / 100, SKY_CLOUD_BASE_REPEAT * scalePercent / 100) },
				uCloudColor: { value: new THREE.Color(DEFAULT_SKY_CLOUD_BOTTOM_COLOR) },
				uOpacity: { value: opacityPercent / 100 },
				uEdgeFade: { value: 0.18 },
				uTileEdgeFade: { value: 0.08 },
				uViewAngleFadeStart: { value: 0.08 },
				uViewAngleFadeEnd: { value: 0.32 },
				uCameraFadeNear: { value: 10.0 },
				uCameraFadeFar: { value: 24.0 }
			},
			transparent: true,
			depthWrite: false,
			vertexShader: `
			varying vec2 vUv;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;

			void main() {
				vUv = uv;
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
			fragmentShader: `
			uniform sampler2D uCloudTexture;
			uniform vec2 uOffset;
			uniform vec2 uRepeat;
			uniform vec3 uCloudColor;
			uniform float uOpacity;
			uniform float uEdgeFade;
			uniform float uTileEdgeFade;
			uniform float uViewAngleFadeStart;
			uniform float uViewAngleFadeEnd;
			uniform float uCameraFadeNear;
			uniform float uCameraFadeFar;
			varying vec2 vUv;
			varying vec3 vWorldPosition;
			varying vec3 vWorldNormal;

			void main() {
				vec2 cloudUv = vUv * uRepeat + uOffset;
				float coverage = texture2D(uCloudTexture, cloudUv).r;

				float planeEdgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
				float planeEdgeFade = smoothstep(0.0, uEdgeFade, planeEdgeDistance);

				vec2 tileUv = fract(cloudUv);
				float tileEdgeDistance = min(min(tileUv.x, 1.0 - tileUv.x), min(tileUv.y, 1.0 - tileUv.y));
				float tileEdgeFade = smoothstep(0.0, uTileEdgeFade, tileEdgeDistance);

				vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
				float viewFacing = abs(dot(normalize(vWorldNormal), viewDirection));
				float viewAngleFade = smoothstep(uViewAngleFadeStart, uViewAngleFadeEnd, viewFacing);

				float cameraDistance = distance(cameraPosition, vWorldPosition);
				float cameraProximityFade = smoothstep(uCameraFadeNear, uCameraFadeFar, cameraDistance);

				float opacity = smoothstep(0.25, 0.8, coverage) * planeEdgeFade * tileEdgeFade * viewAngleFade * cameraProximityFade * uOpacity;
				gl_FragColor = vec4(uCloudColor, opacity);
			}
		`
		});
		const cloudPlane = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), cloudMaterial);
		cloudPlane.rotation.x = -Math.PI / 2;
		cloudPlane.position.copy(MAP_CENTER).setY(baseCloudHeight * (heightPercent + layerSpacingPercent * index) / 100);
		cloudPlane.renderOrder = 5 + index;
		cloudPlane.frustumCulled = false;
		cloudPlane.userData.excludeFromGIContribution = true;
		cloudPlane.visible = visible;
		scene.add(cloudPlane);
		return {
			index,
			material: cloudMaterial,
			plane: cloudPlane
		};
	}

	function disposeLayer(layer) {
		scene.remove(layer.plane);
		layer.plane.geometry.dispose();
		layer.material.dispose();
	}

	function updateLayerHeights() {
		layers.forEach(layer => {
			layer.plane.position.y = baseCloudHeight * (heightPercent + layerSpacingPercent * layer.index) / 100;
		});
	}

	function updateLayerColors() {
		const denominator = Math.max(1, layers.length - 1);
		layers.forEach((layer, index) => {
			const t = index / denominator;
			layer.material.uniforms.uCloudColor.value.copy(bottomColor).lerp(topColor, t);
		});
	}

	function setLayerCount(count) {
		const targetCount = Math.max(1, Math.min(8, Math.round(count)));
		while (layers.length < targetCount) {
			layers.push(createLayer(layers.length));
		}
		while (layers.length > targetCount) {
			disposeLayer(layers.pop());
		}
		updateLayerHeights();
		updateLayerColors();
	}

	setLayerCount(DEFAULT_SKY_CLOUD_LAYER_COUNT);

	return {
		update(dt) {
			layers.forEach(layer => {
				layer.material.uniforms.uOffset.value.x += CLOUD_UV_SCROLL_PER_SECOND.x * dt;
				layer.material.uniforms.uOffset.value.y += CLOUD_UV_SCROLL_PER_SECOND.y * dt;
			});
		},
		setHeightPercent(percent) {
			heightPercent = percent;
			updateLayerHeights();
		},
		setVisible(nextVisible) {
			visible = Boolean(nextVisible);
			layers.forEach(layer => {
				layer.plane.visible = visible;
			});
		},
		setScalePercent(percent) {
			scalePercent = percent;
			const repeat = SKY_CLOUD_BASE_REPEAT * percent / 100;
			layers.forEach(layer => {
				layer.material.uniforms.uRepeat.value.set(repeat, repeat);
			});
		},
		setOpacityPercent(percent) {
			opacityPercent = percent;
			layers.forEach(layer => {
				layer.material.uniforms.uOpacity.value = percent / 100;
			});
		},
		setLayerCount,
		setLayerSpacingPercent(percent) {
			layerSpacingPercent = percent;
			updateLayerHeights();
		},
		setBottomColor(color) {
			bottomColor.set(color);
			updateLayerColors();
		},
		setTopColor(color) {
			topColor.set(color);
			updateLayerColors();
		},
		cloudPlane: layers[0].plane,
		get cloudPlanes() {
			return layers.map(layer => layer.plane);
		}
	};
}

function makeProceduralCloudTexture(size = 256) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;

	const context = canvas.getContext('2d');
	context.fillStyle = '#000000';
	context.fillRect(0, 0, size, size);

	for (let i = 0; i < 90; i++) {
		const x = Math.random() * size;
		const y = Math.random() * size;
		const radius = 12 + Math.random() * 46;
		const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.fill();
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.NoColorSpace;
	return texture;
}
