import * as THREE from 'three';

export const windUniforms = {
	uWindTime: { value: 0 },
	uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
	uWindParams: { value: new THREE.Vector4(0.18, 1.6, 0.5, 1.0) }
};

export function updateWind(dt) {
	windUniforms.uWindTime.value += dt;
}

export function isWindSwayObjectName(name) {
	return name && (name.startsWith('Foliage_') || name.startsWith('Billboard_') || name.startsWith('BillboardUnlit_'));
}

export function isWindSwayBushName(name) {
	return name && (name.startsWith('Billboard_') || name.startsWith('BillboardUnlit_'));
}

export function applyWindSway(material, { isBush = false } = {}) {
	if (Array.isArray(material)) {
		material.forEach(entry => applyWindSway(entry, { isBush }));
		return;
	}
	if (!material || material.userData.windApplied) return;

	const previousOnBeforeCompile = material.onBeforeCompile;
	const previousCacheKey = material.customProgramCacheKey;

	material.customProgramCacheKey = function() {
		const existingKey = previousCacheKey ? previousCacheKey.call(this) : '';
		return `${existingKey}_wind${isBush ? '_bush' : ''}`;
	};

	material.onBeforeCompile = (shader, renderer) => {
		if (previousOnBeforeCompile) previousOnBeforeCompile(shader, renderer);

		shader.uniforms.uWindTime = windUniforms.uWindTime;
		shader.uniforms.uWindDir = windUniforms.uWindDir;
		shader.uniforms.uWindParams = windUniforms.uWindParams;
		shader.uniforms.uWindBush = { value: isBush ? 1.0 : 0.0 };

		injectWindVertex(shader, material);
	};

	material.userData.windApplied = true;
	material.needsUpdate = true;
}

export function createWindDepthMaterial(sourceMaterial, { isBush = false } = {}) {
	const material = new THREE.MeshDepthMaterial({
		depthPacking: THREE.RGBADepthPacking,
		map: sourceMaterial.map,
		alphaMap: sourceMaterial.alphaMap,
		alphaTest: sourceMaterial.alphaTest,
		side: sourceMaterial.side
	});
	applyWindSway(material, { isBush });
	return material;
}

function injectWindVertex(shader, material) {
	let appliedCommon = false;
	let appliedBeginVertex = false;

	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', () => {
			appliedCommon = true;
			return `#include <common>
uniform float uWindTime;
uniform vec2 uWindDir;
uniform vec4 uWindParams;
uniform float uWindBush;`;
		})
		.replace('#include <begin_vertex>', () => {
			appliedBeginVertex = true;
			return `#include <begin_vertex>
{
	#ifdef USE_INSTANCING
		vec3 windInstanceAnchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	#else
		vec3 windInstanceAnchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	#endif
	float windPhase = dot(windInstanceAnchor.xz, vec2(0.7, 1.3));
	float windHeight = max(position.y, 0.0);
	float windHeightMask = pow(clamp(windHeight / 2.0, 0.0, 1.0), uWindParams.w);
	float windFrequency = uWindParams.y;
	float windGust = 1.0 + uWindParams.z * sin(uWindTime * 0.23 + windPhase * 0.5);
	float windSway = sin(uWindTime * windFrequency + windPhase) * 0.85
		+ sin(uWindTime * windFrequency * 2.7 + windPhase * 1.9) * 0.15;
	float windAmplitude = uWindParams.x * windGust * windHeightMask;
	windAmplitude *= mix(1.0, 0.45, uWindBush);
	transformed.x += uWindDir.x * windSway * windAmplitude;
	transformed.z += uWindDir.y * windSway * windAmplitude;
}`;
		});

	if (!appliedCommon || !appliedBeginVertex) {
		console.warn('[DEBUG] Wind sway shader patch missed expected chunks', {
			material: material.name || material.type,
			appliedCommon,
			appliedBeginVertex
		});
	}
}
