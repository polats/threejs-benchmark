// VerticalGradient.js - API for applying vertical gradients to materials

// Store materials that have gradients applied for global control
const gradientMaterials = new Set();

// Preset configurations for different object types
export const GRADIENT_PRESETS = {
	tiles: { gradientBottom: -0.5, gradientTop: 0.0, mixMin: 0.3, mixMax: 1.0 },
	buildings: { gradientBottom: -1.0, gradientTop: 1.0, mixMin: 0.3, mixMax: 1.0 },
	foliage: { gradientBottom: -0.5, gradientTop: 1.0, mixMin: 0.4, mixMax: 1.0 },
	decals: { gradientBottom: -0.5, gradientTop: 0.0, mixMin: 1.0, mixMax: 1.0 },
	units: { gradientBottom: -0.5, gradientTop: 0.5, mixMin: 0.4, mixMax: 1.0 },
	liquid: { gradientBottom: -0.5, gradientTop: 0.0, mixMin: 0.8, mixMax: 1.0 },
	billboard: { gradientBottom: -0.2, gradientTop: 0.8, mixMin: 0.5, mixMax: 1.2 },
	billboardUnlit: { gradientBottom: 0.0, gradientTop: 0.0, mixMin: 1.0, mixMax: 1.0 }
};

// Apply vertical gradient shader to a material
export function applyVerticalGradient(material, {
	gradientBottom = 0.0,
	gradientTop = 4.0,
	mixMin = 0.2,
	mixMax = 1.0,
	enabled = true
} = {}) {
	if (!material) return;

	// Store config for clone inheritance and recompilation
	material.userData.gradientConfig = { gradientBottom, gradientTop, mixMin, mixMax, enabled };

	// CRITICAL: Unique cache key so THREE.js doesn't reuse shaders with different baked values
	material.customProgramCacheKey = function() {
		const cfg = this.userData.gradientConfig;
		return `gradient_${cfg.gradientBottom}_${cfg.gradientTop}_${cfg.mixMin}_${cfg.mixMax}`;
	};

	material.onBeforeCompile = (shader) => {
		const gradientConfig = material.userData.gradientConfig;
		const gradientSpan = gradientConfig.gradientTop - gradientConfig.gradientBottom;
		const gradientFactorExpression = Math.abs(gradientSpan) < 0.0001
			? '1.0'
			: `smoothstep(${gradientConfig.gradientBottom.toFixed(1)}, ${gradientConfig.gradientTop.toFixed(1)}, vWorldY)`;

		// Add gradient uniforms
		shader.uniforms.uGradientEnabled = { value: material.userData.gradientConfig.enabled ? 1.0 : 0.0 };
		material.userData.gradientUniforms = shader.uniforms;

		// Register material for global control
		gradientMaterials.add(material);

		// Always add gradient code, controlled by uniform
		// Vertex shader modifications
		shader.vertexShader = shader.vertexShader.replace(
			'#include <common>',
			`
			#include <common>
			varying float vWorldY;
			`
		);

		shader.vertexShader = shader.vertexShader.replace(
			'#include <worldpos_vertex>',
			`
			#include <worldpos_vertex>
			vec4 worldPosForGradient = vec4(transformed, 1.0);
			#ifdef USE_INSTANCING
				worldPosForGradient = instanceMatrix * worldPosForGradient;
			#endif
			worldPosForGradient = modelMatrix * worldPosForGradient;
			vWorldY = worldPosForGradient.y;
			`
		);

		// Fragment shader modifications
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <common>',
			`
			#include <common>
			varying float vWorldY;
			uniform float uGradientEnabled;
			`
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <map_fragment>',
			`
			#include <map_fragment>

			float gradientFactor = ${gradientFactorExpression};
			float mixVal = mix(${material.userData.gradientConfig.mixMin.toFixed(1)}, ${material.userData.gradientConfig.mixMax.toFixed(1)}, gradientFactor);
			mixVal = mix(1.0, mixVal, uGradientEnabled);
			// Debug: output gradient values for inspection (commented out to fix decal darkening bug)
			// diffuseColor.rgb = vec3(gradientFactor, mixVal, uGradientEnabled);
			diffuseColor.rgb *= mixVal;
			`
		);
	};
}

// Toggle gradient on/off for a specific material
export function setGradientEnabled(material, enabled) {
	if (material?.userData?.gradientConfig) {
		// Update the enabled state
		material.userData.gradientConfig.enabled = enabled;

		// Update the uniform value if it exists
		if (material.userData.gradientUniforms?.uGradientEnabled) {
			material.userData.gradientUniforms.uGradientEnabled.value = enabled ? 1.0 : 0.0;
			console.log(`Set gradient ${enabled ? 'ON' : 'OFF'} for material ${material.name || 'unnamed'}, uniform value: ${material.userData.gradientUniforms.uGradientEnabled.value}, config:`, material.userData.gradientConfig);
		} else {
			console.log(`No gradient uniforms found for material ${material.name || 'unnamed'}`);
		}

		// Force shader recompilation
		material.needsUpdate = true;
	}
}

// Toggle vertical gradient on/off for all registered gradient materials
export function setAllGradientsEnabled(enabled) {
	gradientMaterials.forEach(material => {
		setGradientEnabled(material, enabled);
	});
}

// Remove a material from gradient tracking
export function removeGradientMaterial(material) {
	gradientMaterials.delete(material);
}

// Get all materials with gradients applied
export function getGradientMaterials() {
	return new Set(gradientMaterials);
}
