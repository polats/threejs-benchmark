import * as THREE from 'three';
import { CLOUD_COOKIE_BASE_SCALE, CLOUD_UV_SCROLL_PER_SECOND, DEFAULT_CLOUD_MASK_INTENSITY_PERCENT, DEFAULT_CLOUD_SCALE_PERCENT, DEFAULT_CLOUD_SHADOW_TINT } from './CloudSettings.js';

export const cloudCookieUniforms = {
	uCloudTexture: { value: null },
	uCloudScale: { value: CLOUD_COOKIE_BASE_SCALE * DEFAULT_CLOUD_SCALE_PERCENT / 100 },
	uCloudOffset: { value: new THREE.Vector2(0, 0) },
	uCloudIntensity: { value: DEFAULT_CLOUD_MASK_INTENSITY_PERCENT / 100 },
	uCloudTint: { value: new THREE.Color(DEFAULT_CLOUD_SHADOW_TINT) },
	uCloudDebugOnly: { value: 0 },
	uCloudVisible: { value: 1 }
};

export function initCloudCookie(texture) {
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.colorSpace = THREE.NoColorSpace;
	cloudCookieUniforms.uCloudTexture.value = texture;
}

export function updateCloudCookie(dt) {
	cloudCookieUniforms.uCloudOffset.value.x += CLOUD_UV_SCROLL_PER_SECOND.x * dt;
	cloudCookieUniforms.uCloudOffset.value.y += CLOUD_UV_SCROLL_PER_SECOND.y * dt;
}

export function setCloudCookieDebugOnly(enabled) {
	cloudCookieUniforms.uCloudDebugOnly.value = enabled ? 1 : 0;
}

export function setCloudCookieIntensityPercent(percent) {
	cloudCookieUniforms.uCloudIntensity.value = percent / 100;
}

export function setCloudCookieScalePercent(percent) {
	cloudCookieUniforms.uCloudScale.value = CLOUD_COOKIE_BASE_SCALE * percent / 100;
}

export function setCloudCookieTintColor(color) {
	cloudCookieUniforms.uCloudTint.value.set(color);
}

export function setCloudCookieVisible(visible) {
	cloudCookieUniforms.uCloudVisible.value = visible ? 1 : 0;
}

export function applyCloudCookie(material) {
	if (Array.isArray(material)) {
		material.forEach(applyCloudCookie);
		return;
	}
	if (!material) return;
	if (material.userData.cloudCookieApplied) return;

	const previousOnBeforeCompile = material.onBeforeCompile;
	const previousCacheKey = material.customProgramCacheKey;

	material.customProgramCacheKey = function() {
		const existingKey = previousCacheKey ? previousCacheKey.call(this) : '';
		return `${existingKey}_cloudCookie`;
	};

	material.onBeforeCompile = (shader, renderer) => {
		if (previousOnBeforeCompile) previousOnBeforeCompile(shader, renderer);

		shader.uniforms.uCloudTexture = cloudCookieUniforms.uCloudTexture;
		shader.uniforms.uCloudScale = cloudCookieUniforms.uCloudScale;
		shader.uniforms.uCloudOffset = cloudCookieUniforms.uCloudOffset;
		shader.uniforms.uCloudIntensity = cloudCookieUniforms.uCloudIntensity;
		shader.uniforms.uCloudTint = cloudCookieUniforms.uCloudTint;
		shader.uniforms.uCloudDebugOnly = cloudCookieUniforms.uCloudDebugOnly;
		shader.uniforms.uCloudVisible = cloudCookieUniforms.uCloudVisible;

		let appliedVertex = false;
		let appliedFragment = false;

		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>
				uniform float uCloudScale;
				uniform vec2 uCloudOffset;
				varying vec2 vCloudCookieUv;
			`)
			.replace('#include <worldpos_vertex>', () => {
				appliedVertex = true;
				return `#include <worldpos_vertex>
				vec4 cloudCookieWorldPosition = vec4(transformed, 1.0);
				#ifdef USE_INSTANCING
					cloudCookieWorldPosition = instanceMatrix * cloudCookieWorldPosition;
				#endif
				cloudCookieWorldPosition = modelMatrix * cloudCookieWorldPosition;
				vCloudCookieUv = vec2(cloudCookieWorldPosition.x, -cloudCookieWorldPosition.z) * uCloudScale + uCloudOffset;
			`;
			});

		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>
				uniform sampler2D uCloudTexture;
				uniform float uCloudIntensity;
				uniform vec3 uCloudTint;
				uniform int uCloudDebugOnly;
				uniform int uCloudVisible;
				varying vec2 vCloudCookieUv;

				vec3 cloudCookieOverlayBlend(vec3 baseColor, vec3 blendColor) {
					return mix(
						2.0 * baseColor * blendColor,
						1.0 - 2.0 * (1.0 - baseColor) * (1.0 - blendColor),
						step(0.5, baseColor)
					);
				}

				vec3 cloudCookieLinearToSrgb(vec3 color) {
					return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
				}

				vec3 cloudCookieSrgbToLinear(vec3 color) {
					return pow(max(color, vec3(0.0)), vec3(2.2));
				}
			`)
			.replace('#include <opaque_fragment>', () => {
				appliedFragment = true;
				return `
				float cloudCookieCoverage = texture2D(uCloudTexture, vCloudCookieUv).r;
				float cloudCookieMask = smoothstep(0.2, 0.85, cloudCookieCoverage);
				if (uCloudDebugOnly == 1) {
					outgoingLight = vec3(cloudCookieMask);
				} else {
					float cloudCookieIntensity = uCloudVisible == 1 ? uCloudIntensity : 0.0;
					vec3 cloudCookieBaseSrgb = cloudCookieLinearToSrgb(outgoingLight);
					vec3 cloudCookieTintSrgb = cloudCookieLinearToSrgb(uCloudTint);
					vec3 cloudCookieOverlaySrgb = cloudCookieOverlayBlend(cloudCookieBaseSrgb, cloudCookieTintSrgb);
					vec3 cloudCookieTintedLight = cloudCookieSrgbToLinear(mix(cloudCookieBaseSrgb, cloudCookieOverlaySrgb, cloudCookieMask));
					outgoingLight = mix(outgoingLight, cloudCookieTintedLight, cloudCookieIntensity);
				}
				#include <opaque_fragment>
			`;
			});

		if (!appliedVertex || !appliedFragment) {
			console.warn('[DEBUG] Cloud cookie shader patch missed expected chunks', {
				material: material.name || material.type,
				appliedVertex,
				appliedFragment
			});
		}
	};
	material.userData.cloudCookieApplied = true;

	material.needsUpdate = true;
}
