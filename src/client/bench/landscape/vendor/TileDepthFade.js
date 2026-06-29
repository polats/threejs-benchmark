import * as THREE from 'three';

const TILE_DEPTH_FADE_SKY_COLOR = new THREE.Color(0x8ec9e6);
const TILE_DEPTH_FADE_TOP_Y = 0.02;
const TILE_DEPTH_FADE_BOTTOM_Y = -1.0;
const TILE_DEPTH_FADE_STRENGTH = 0.92;
const TILE_DEPTH_FADE_DARKEN_STRENGTH = 0.34;

export function applyTileDepthFade(material) {
	if (Array.isArray(material)) {
		material.forEach(applyTileDepthFade);
		return;
	}
	if (!material) return;
	if (material.userData.tileDepthFadeWrapper === material.onBeforeCompile) return;

	const previousOnBeforeCompile = material.onBeforeCompile;
	const previousCacheKey = material.customProgramCacheKey;

	material.customProgramCacheKey = function() {
		const existingKey = previousCacheKey ? previousCacheKey.call(this) : '';
		return `${existingKey}_tileDepthFade`;
	};

	material.onBeforeCompile = (shader, renderer) => {
		if (previousOnBeforeCompile) previousOnBeforeCompile(shader, renderer);

		shader.uniforms.uTileDepthFadeSkyColor = { value: TILE_DEPTH_FADE_SKY_COLOR };
		shader.uniforms.uTileDepthFadeTopY = { value: TILE_DEPTH_FADE_TOP_Y };
		shader.uniforms.uTileDepthFadeBottomY = { value: TILE_DEPTH_FADE_BOTTOM_Y };
		shader.uniforms.uTileDepthFadeStrength = { value: TILE_DEPTH_FADE_STRENGTH };
		shader.uniforms.uTileDepthFadeDarkenStrength = { value: TILE_DEPTH_FADE_DARKEN_STRENGTH };

		let appliedPosition = false;
		let appliedNormal = false;
		let appliedFragment = false;

		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>
				varying float vTileDepthFadeWorldY;
				varying vec3 vTileDepthFadeWorldNormal;
			`)
			.replace('#include <defaultnormal_vertex>', () => {
				appliedNormal = true;
				return `#include <defaultnormal_vertex>
				vec3 tileDepthFadeWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
				#ifdef USE_INSTANCING
					tileDepthFadeWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
				#endif
				vTileDepthFadeWorldNormal = tileDepthFadeWorldNormal;
			`;
			})
			.replace('#include <worldpos_vertex>', () => {
				appliedPosition = true;
				return `#include <worldpos_vertex>
				vec4 tileDepthFadeWorldPosition = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					tileDepthFadeWorldPosition = instanceMatrix * tileDepthFadeWorldPosition;
				#endif
				tileDepthFadeWorldPosition = modelMatrix * tileDepthFadeWorldPosition;
				vTileDepthFadeWorldY = tileDepthFadeWorldPosition.y;
			`;
			});

		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
				uniform vec3 uTileDepthFadeSkyColor;
				uniform float uTileDepthFadeTopY;
				uniform float uTileDepthFadeBottomY;
				uniform float uTileDepthFadeStrength;
				uniform float uTileDepthFadeDarkenStrength;
				varying float vTileDepthFadeWorldY;
				varying vec3 vTileDepthFadeWorldNormal;
			`)
			.replace('#include <opaque_fragment>', () => {
				appliedFragment = true;
				return `
				float tileDepthFadeVerticalMask = 1.0 - smoothstep(0.25, 0.85, abs(normalize(vTileDepthFadeWorldNormal).y));
				float tileDepthFadeHeightMask = 1.0 - smoothstep(uTileDepthFadeBottomY, uTileDepthFadeTopY, vTileDepthFadeWorldY);
				float tileDepthFadeHeightT = clamp((vTileDepthFadeWorldY - uTileDepthFadeBottomY) / (uTileDepthFadeTopY - uTileDepthFadeBottomY), 0.0, 1.0);
				float tileDepthFadeDarkenMask = (1.0 - smoothstep(0.90, 1.0, tileDepthFadeHeightT)) * smoothstep(0.18, 0.90, tileDepthFadeHeightT);
				outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.42, 0.48, 0.36), tileDepthFadeDarkenMask * tileDepthFadeVerticalMask * uTileDepthFadeDarkenStrength);
				float tileDepthFadeMask = tileDepthFadeVerticalMask * tileDepthFadeHeightMask * uTileDepthFadeStrength;
				outgoingLight = mix(outgoingLight, uTileDepthFadeSkyColor, tileDepthFadeMask);
				#include <opaque_fragment>
			`;
			});

		if (!appliedPosition || !appliedNormal || !appliedFragment) {
			console.warn('[DEBUG] Tile depth fade shader patch missed expected chunks', {
				appliedPosition,
				appliedNormal,
				appliedFragment
			});
		}
	};

	material.userData.tileDepthFadeWrapper = material.onBeforeCompile;
	material.needsUpdate = true;
}
