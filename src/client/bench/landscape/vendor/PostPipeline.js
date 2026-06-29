import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from './Libs/GTAOPass.js';
import { sharedAtlasMaterial } from './TileLoader.js';

const DEFAULT_GTAO = {
	radius: 1.15,
	distanceExponent: 1,
	thickness: 0.8,
	distanceFallOff: 1,
	scale: 1,
	samples: 12,
	screenSpaceRadius: false
};

const DEFAULT_DENOISE = {
	lumaPhi: 8,
	depthPhi: 2,
	normalPhi: 3,
	radius: 3,
	radiusExponent: 1,
	rings: 2,
	samples: 12
};

export function createPostPipeline({ renderer, scene, getCamera, getVignetteVisible }) {
	const postScene = new THREE.Scene();
	const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const initialCamera = getCamera();
	const rendererSize = renderer.getSize(new THREE.Vector2());
	// GTAO is driven manually (no EffectComposer): render the solids, multiply the AO
	// map over them, then draw the additive/transparent atmospherics on top. Keeping
	// the atmospherics out of the AO multiply is what stops them washing out the
	// contact shadows (and avoids the AO darkening light shafts).
	const gtaoPass = new GTAOPass(scene, initialCamera, rendererSize.x, rendererSize.y, { resolutionScale: 0.5 });
	gtaoPass.blendIntensity = 0.72;
	gtaoPass.updateGtaoMaterial(DEFAULT_GTAO);
	gtaoPass.updatePdMaterial(DEFAULT_DENOISE);
	gtaoPass.setSize(rendererSize.x, rendererSize.y);

	// Alpha-cutout aware normal/depth G-buffer. The stock GTAOPass renders the
	// G-buffer with a plain MeshNormalMaterial override, which ignores alpha test, so
	// alpha-cut foliage is treated as solid quads and gets AO on its transparent
	// corners. Every atlas mesh shares one texture, so a single override material can
	// sample the atlas alpha and discard cut-out texels (the .map is wired in lazily
	// once TileLoader has loaded it). MeshNormalMaterial keeps native instancing/
	// skinning support; we only inject the alpha discard.
	// MeshNormalMaterial provides the uv plumbing (vMapUv, gated by USE_MAP when .map
	// is set) but not a `map` sampler, so we declare our own and sample the atlas alpha.
	const gtaoAlphaTest = { value: 0.5 };
	const gtaoAlphaMap = { value: null };
	const gtaoNormalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
	gtaoNormalMaterial.blending = THREE.NoBlending;
	gtaoNormalMaterial.onBeforeCompile = (shader) => {
		shader.uniforms.uGtaoAlphaTest = gtaoAlphaTest;
		shader.uniforms.uGtaoAlphaMap = gtaoAlphaMap;
		shader.fragmentShader = 'uniform float uGtaoAlphaTest;\nuniform sampler2D uGtaoAlphaMap;\n' + shader.fragmentShader.replace(
			'void main() {',
			'void main() {\n\t#ifdef USE_MAP\n\tif ( texture2D( uGtaoAlphaMap, vMapUv ).a < uGtaoAlphaTest ) discard;\n\t#endif'
		);
	};
	gtaoPass.normalMaterial = gtaoNormalMaterial;

	// Fullscreen pass that multiplies the denoised AO map over the screen. Reuses
	// GTAOPass's own blend material (CustomBlending: result = src * dstColor), whose
	// shader emits mix(white, ao, intensity), so AO=1 areas are untouched.
	const aoMultiplyQuad = new FullScreenQuad(gtaoPass.blendMaterial);
	let gtaoVisible = false;

	const postMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		depthTest: false,
		blending: THREE.NormalBlending,
		uniforms: {
			uOpacity: { value: 0.16 },
			uAspect: { value: window.innerWidth / window.innerHeight }
		},
		vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = vec4(position.xy, 0.0, 1.0);
			}
		`,
		fragmentShader: `
			varying vec2 vUv;
			uniform float uOpacity;
			uniform float uAspect;

			void main() {
				vec2 centeredUv = vUv - 0.5;
				centeredUv.x *= uAspect;
				float distanceFromCenter = length(centeredUv);
				float edgeMask = smoothstep(0.28, 0.82, distanceFromCenter);
				gl_FragColor = vec4(0.0, 0.0, 0.0, edgeMask * uOpacity);
			}
		`
	});

	postMaterial.visible = getVignetteVisible();
	postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));

	function resize() {
		// Vendored tweak: this canvas isn't full-window (sidebars), so size the AO
		// pass to the renderer's actual drawing size instead of window.inner*.
		const size = renderer.getSize(new THREE.Vector2());
		postMaterial.uniforms.uAspect.value = size.x / size.y;
		gtaoPass.setSize(size.x, size.y);
	}

	function renderAOMultiply(activeCamera) {
		gtaoPass.camera = activeCamera;
		// Wire the shared atlas into the G-buffer override once TileLoader has it, so
		// alpha-cut foliage discards its transparent texels instead of occluding.
		if (!gtaoNormalMaterial.map && sharedAtlasMaterial && sharedAtlasMaterial.map) {
			gtaoNormalMaterial.map = sharedAtlasMaterial.map; // enables USE_MAP -> vMapUv
			gtaoNormalMaterial.needsUpdate = true;
			gtaoAlphaMap.value = sharedAtlasMaterial.map;
			gtaoAlphaTest.value = sharedAtlasMaterial.alphaTest ?? 0.5;
		}
		// Compute the denoised AO map into gtaoPass.gtaoMap without compositing it.
		// The G-buffer skips points/lines and excludeFromGIContribution meshes, so the
		// atmospherics don't generate occlusion. (Off output leaves the screen alone.)
		const previousOutput = gtaoPass.output;
		gtaoPass.output = GTAOPass.OUTPUT.Off;
		gtaoPass.render(renderer, null, null);
		gtaoPass.output = previousOutput;

		// Multiply the AO over the finished frame on the default framebuffer.
		gtaoPass.blendMaterial.uniforms.intensity.value = gtaoPass.blendIntensity;
		gtaoPass.blendMaterial.uniforms.tDiffuse.value = gtaoPass.gtaoMap;
		const previousAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.setRenderTarget(null);
		aoMultiplyQuad.render(renderer);
		renderer.autoClear = previousAutoClear;
	}

	function hideMatchingObjects(predicate) {
		const changedObjects = [];
		scene.traverse(object => {
			const renderable = object.isMesh || object.isLine || object.isPoints || object.isSprite;
			if (!renderable || !object.visible || !predicate(object)) return;
			object.visible = false;
			changedObjects.push(object);
		});
		return () => {
			for (const object of changedObjects) object.visible = true;
		};
	}

	function render(activeCamera) {
		if (gtaoVisible) {
			// 1) Solid scene only -> color + depth on the canvas.
			const restoreExcluded = hideMatchingObjects(object => object.userData.excludeFromGIContribution);
			renderer.render(scene, activeCamera);
			restoreExcluded();

			// 2) Multiply AO over the solids.
			renderAOMultiply(activeCamera);

			// 3) Additive/transparent atmospherics last, on top of the AO'd image so
			//    they aren't darkened by AO. They depth-test against the solid depth
			//    still in the canvas (no clearDepth), so terrain occludes them.
			const restoreSolids = hideMatchingObjects(object => !object.userData.excludeFromGIContribution);
			const previousAutoClear = renderer.autoClear;
			const previousBackground = scene.background;
			renderer.autoClear = false;
			scene.background = null;
			renderer.render(scene, activeCamera);
			renderer.autoClear = previousAutoClear;
			scene.background = previousBackground;
			restoreSolids();
		} else {
			renderer.render(scene, activeCamera);
		}
		if (!getVignetteVisible()) return;

		const previousAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.clearDepth();
		renderer.render(postScene, postCamera);
		renderer.autoClear = previousAutoClear;
	}

	function setVisible(visible) {
		postMaterial.visible = visible;
	}

	function setGTAOVisible(visible) {
		gtaoVisible = Boolean(visible);
	}

	function getGTAOVisible() {
		return gtaoVisible;
	}

	return {
		resize,
		render,
		setVisible,
		setGTAOVisible,
		getGTAOVisible
	};
}
